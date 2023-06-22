// WebCall Copyright 2023 timur.mobi. All rights reserved.
//
// These methods enable callees to managed temporary ID's.

package main

import (
	"net/http"
	"fmt"
	"io"
	"time"
	"strings"
)


func httpGetMapping(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /getmapping calleeID empty urlID=%s %s\n",urlID, remoteAddr)
		return
	}
	if cookie==nil {
		fmt.Printf("# /getmapping (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /getmapping urlID=%s != calleeID=%s %s\n",urlID,calleeID, remoteAddr)
		return
	}

	errcode,altIDs := getMapping(calleeID,remoteAddr)
	if errcode==0 && altIDs!="" {
		// TODO here we might want to parse altIDs for plausibility
		fmt.Fprintf(w,altIDs)
	}
	// if(xhr.responseText=="") there are no altIDs
}

func getMapping(calleeID string, remoteAddr string) (int,string) {
	// use calleeID to get AltIDs from DbUser
	// format: id,true,usage|id,true,usage|...
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		if strings.Index(err.Error(),"key not found")<0 {
			fmt.Printf("# getmapping (%s) get dbRegisteredIDs rip=%s err=%v\n", calleeID, remoteAddr, err)
		}
		return 1,""
	}

	dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		if strings.Index(err.Error(),"key not found")<0 {
			fmt.Printf("# getmapping (%s) get dbUser (%s) rip=%s err=%v\n", calleeID, dbUserKey, remoteAddr, err)
		}
		return 2,""
	}

	if dbUser.AltIDs!="" {
		if logWantedFor("mapping") {
			fmt.Printf("getmapping (%s) altIDs=(%s) rip=%s\n", calleeID, dbUser.AltIDs, remoteAddr)
		}
	}
	return 0,dbUser.AltIDs
}

func httpSetMapping(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	// store contactID with name into contacts of calleeID
	// httpSetContacts does not report errors back to the client (only logs them)
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /setmapping calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /setmapping (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /setmapping urlID=%s != calleeID=%s %s\n", urlID, calleeID, remoteAddr)
		return
	}

	data := ""
	postBuf := make([]byte, 2000)
	length,_ := io.ReadFull(r.Body, postBuf)
	if length>0 {
		data = string(postBuf[:length])
	}

	// NOTE: one mistake and the current .AltIDs are gone
	// TODO: plausibility check on data: id must be numerical, must not contain blanks, max len of id and assign
	//       must not contain linefeeds, '<' and '>'
	// /setmapping (98597153158) done data=(93489236986,true,|77728892315,true,|48849331002,true,|94042933561,true,)
	if strings.HasPrefix(data,"<") {
		dispData := data
		if len(data)>20 { dispData = data[:20] }
		fmt.Printf("# /setmapping (%s) format error '<' data=(%s)\n",calleeID, dispData)
		fmt.Fprintf(w,"errorFormat")
		return
	}
	if strings.Contains(data,"\n") {
		dispData := data
		if len(data)>20 { dispData = data[:20] }
		fmt.Printf("# /setmapping (%s) format error 'lf' data=(%s)\n",calleeID, dispData)
		fmt.Fprintf(w,"errorFormat")
		return
	}

	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		fmt.Printf("# /setmapping (%s) data=(%s) err=%v\n",calleeID, data, err)
		fmt.Fprintf(w,"errorGetID")
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		fmt.Printf("# /setmapping (%s) data=(%s) err=%v\n",calleeID, data, err)
		fmt.Fprintf(w,"errorGetUser")
		return
	}

	dbUser.AltIDs = data
	err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, true)
	if err != nil {
		fmt.Printf("# /setmapping (%s) data=(%s) err=%v\n",calleeID, data, err)
		fmt.Fprintf(w,"errorSetUser")
		return
	}
	// no error

	// update mapping[] and ringMuted[] according to AltIDs
	if dbUser.AltIDs!="" {
		//fmt.Printf("initloop %s (%s)->%s\n",k,calleeID,dbUser.AltIDs)
		toks := strings.Split(dbUser.AltIDs, "|")
		for tok := range toks {
			toks2 := strings.Split(toks[tok], ",")
			if toks2[0] != "" {
				// ensure mappedID is not overlong and does not contain wrong format data (e.g. HTML)
				mappedID := toks2[0]
				mappedID = strings.Replace(mappedID, " ", "", -1)
				mappedID = strings.Replace(mappedID, "\n", "", -1)
				mappedID = strings.Replace(mappedID, "<", "", -1)
				mappedID = strings.Replace(mappedID, ">", "", -1)
				mappedID = strings.TrimSpace(mappedID)
				if len(mappedID)>32 {
					mappedID = mappedID[:32]
				}

				ringMutedMutex.Lock()
				if toks2[1] != "true" {
					// this mapping is deactivated: set ringMuted
					fmt.Printf("/setmapping (%s) set ringMuted for (%s)\n",calleeID, mappedID)
					ringMuted[mappedID] = struct{}{}
				} else {
					// this mapping is activated: clear ringMuted
					fmt.Printf("/setmapping (%s) clear ringMuted for (%s)\n",calleeID, mappedID)
					delete(ringMuted,mappedID)
				}
				ringMutedMutex.Unlock()

				mappingData := mapping[mappedID]
				if mappingData.CalleeId != calleeID {
					assignedName := toks2[2]
					// ensure assignedName is not overlong and does not contain wrong format data (e.g. HTML)
					assignedName = strings.Replace(assignedName, " ", "", -1)
					assignedName = strings.Replace(assignedName, "\n", "", -1)
					assignedName = strings.Replace(assignedName, "<", "", -1)
					assignedName = strings.Replace(assignedName, ">", "", -1)
					assignedName = strings.TrimSpace(assignedName)
					if len(mappedID)>10 {
						mappedID = mappedID[:10]
					}

					fmt.Printf("/setmapping (%s) set (%s)=(%s)\n",calleeID, mappedID, assignedName)
					mappingMutex.Lock()
					mapping[mappedID] = MappingDataType{calleeID,assignedName}
					mappingMutex.Unlock()
				}
			}
		}
	}

	//fmt.Printf("/setmapping (%s) done data=(%s)\n",calleeID, data)
	return
}

func httpFetchID(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string, startRequestTime time.Time) {
	// fetch a new unused callee-ID
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /fetchid calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /fetchid (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	// if calleeID!=urlID, that's likely someone trying to run more than one callee in the same browser
	if urlID!="" && urlID!=calleeID {
		fmt.Printf("# /fetchid urlID=%s != calleeID=%s %s\n", urlID, calleeID, remoteAddr)
		return
	}

	if allowNewAccounts {
		// create new random, free ID, register it and return it
		registerID,err := GetRandomCalleeID()
		if err!=nil {
			fmt.Printf("# /fetchid (%s) GetRandomCalleeID err=%v\n",calleeID,err)
			return
		}
		if registerID=="" {
			fmt.Printf("# /fetchid (%s) registerID is empty\n",calleeID)
			return
		}

		var dbEntryRegistered DbEntry
		err = kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
		if err==nil {
			// registerID is already registered
			fmt.Printf("# /fetchid (%s) newid=%s already registered db=%s bucket=%s\n",
				calleeID, registerID, dbMainName, dbRegisteredIDs)
			fmt.Fprintf(w, "error already registered")
// TODO jump to GetRandomCalleeID()?
			return
		}

		unixTime := startRequestTime.Unix()
		err = kvMain.Put(dbRegisteredIDs, registerID, DbEntry{unixTime, remoteAddr}, false)
		if err!=nil {
			fmt.Printf("# /fetchid (%s) error db=%s bucket=%s put err=%v\n",
				registerID,dbMainName,dbRegisteredIDs,err)
			fmt.Fprintf(w,"error cannot register ID")
			// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
		} else {
			// add registerID -> calleeID (assign) to mapping.map
			mappingMutex.Lock()
			mapping[registerID] = MappingDataType{calleeID,"none"}
			mappingMutex.Unlock()
			fmt.Fprintf(w,registerID)
		}
	}

	return
}

func httpSetAssign(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	// urlID is the tmpID to set assigb
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /setassign calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /setassign (%s) fail no cookie urlID=%s %s\n", calleeID, urlID, remoteAddr)
		return
	}
	if urlID=="" {
		fmt.Printf("# /setassign (%s) fail urlID empty %s\n", calleeID, urlID, remoteAddr)
		return
	}
	if calleeID!=urlID {
		// this happens bc someone with calleeID in the cookie is now trying to use urlID via url
		fmt.Printf("# /setassign urlID(%s) != calleeID(%s) %s ua=%s\n",
			urlID, calleeID, remoteAddr, r.UserAgent())
		return
	}

	setID := ""
	url_arg_array, ok := r.URL.Query()["setid"]
	if ok {
		setID = url_arg_array[0]
		if setID!="" {
			assign := "none"
			url_arg_array, ok = r.URL.Query()["assign"]
			if ok {
				assign = url_arg_array[0]

				fmt.Printf("/setassign (%s) setID=%s assign=%s %s\n", calleeID, setID, assign, remoteAddr)
				mappingMutex.Lock()
				mappingData := mapping[setID]
				mapping[setID] = MappingDataType{mappingData.CalleeId,assign}
				mappingMutex.Unlock()
				fmt.Fprintf(w,"ok")
			}
		}
	}
}

func httpDeleteMapping(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	// urlID is the tmpID to be deleted
	if calleeID=="" || calleeID=="undefined" {
		//fmt.Printf("# /deletemapping calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /deletemapping (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	if urlID=="" {
		fmt.Printf("# /deletemapping (%s) fail urlID empty %s\n", calleeID, urlID, remoteAddr)
		return
	}
	if calleeID!=urlID {
		// this happens bc someone with calleeID in the cookie is now trying to use urlID via url
		fmt.Printf("# /deletemapping urlID(%s) != calleeID(%s) %s ua=%s\n",
			urlID, calleeID, remoteAddr, r.UserAgent())
		return
	}

	delID := ""
	url_arg_array, ok := r.URL.Query()["delid"]
	if ok {
		delID = url_arg_array[0]
		if delID!="" {
			errcode := deleteMapping(calleeID,delID,remoteAddr)
			switch(errcode) {
				case 1:
					fmt.Fprintf(w,"errorDeleteRegistered")
					return
				case 2:
					// ignore error creating dbBlockedID ???
			}

			fmt.Fprintf(w,"ok")
		}
	}
}

func deleteMapping(calleeID string, delID string, remoteAddr string) int {
	// unregister delID from dbRegisteredIDs
	err := kvMain.Delete(dbRegisteredIDs, delID)
	if err!=nil {
		fmt.Printf("# deletemapping fail to delete id=%s err=%s\n", delID, err)
		return 1
	}

	fmt.Printf("deletemapping (%s) id=%s %s\n", calleeID, delID, remoteAddr)

	// remove delID from mapping.map
	mappingMutex.Lock()
	delete(mapping,delID)
	mappingMutex.Unlock()

	// create a dbBlockedIDs entry (will be deleted after 60 days by timer)
	unixTime := time.Now().Unix()
	dbUserKey := fmt.Sprintf("%s_%d",delID, unixTime)
	fmt.Printf("deletemapping (%s) created blockedID key=%s %s\n", calleeID, dbUserKey, remoteAddr)
	err = kvMain.Put(dbBlockedIDs, dbUserKey, DbUser{}, false)
	if err!=nil {
		fmt.Printf("# deletemapping error db=%s bucket=%s put key=%s err=%v\n",
			dbMainName,dbBlockedIDs,delID,err)
		return 2
	}
	return 0
}

