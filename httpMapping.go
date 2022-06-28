// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// These methods enable callees to managed temporary ID's.

package main

import (
	"net/http"
	"fmt"
	"io"
	"time"
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

	// use calleeID to get AltIDs from DbUser
	// format: id,true,usage|id,true,usage|...
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		fmt.Printf("# /getmapping (%s) get dbRegisteredIDs rip=%s err=%v\n", calleeID, remoteAddr, err)
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		fmt.Printf("# /getmapping (%s) get dbUser (%s) rip=%s err=%v\n", calleeID, dbUserKey, remoteAddr, err)
		return
	}

	fmt.Fprintf(w,dbUser.AltIDs)
	return
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
	fmt.Printf("/setmapping (%s) data=(%s)\n",calleeID, data)
	return
}

func httpFetchID(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string, startRequestTime time.Time) {
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

	if allowNewAccounts {
		// create new random, free ID, register it and return it
		registerID,err := GetRandomCalleeID()
		if err!=nil {
			fmt.Printf("# /setmapping (%s) GetRandomCalleeID err=%v\n",calleeID,err)
			return
		}
		if registerID=="" {
			fmt.Printf("# /setmapping (%s) registerID is empty\n",calleeID)
			return
		}

		var dbEntryRegistered DbEntry
		err = kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
		if err==nil {
			// registerID is already registered
			fmt.Printf("# /setmapping (%s) newid=%s already registered db=%s bucket=%s\n",
				calleeID, registerID, dbMainName, dbRegisteredIDs)
			fmt.Fprintf(w, "error already registered")
			return
		}

		unixTime := startRequestTime.Unix()
		// "nopw": tmpID's don't have passwords
		err = kvMain.Put(dbRegisteredIDs, registerID, DbEntry{unixTime, remoteAddr, "nopw"}, false)
		if err!=nil {
			fmt.Printf("# /setmapping (%s) error db=%s bucket=%s put err=%v\n",
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

	assign := "none"
	url_arg_array, ok := r.URL.Query()["assign"]
	if ok {
		assign = url_arg_array[0]
	}

	fmt.Printf("/setassign (%s) urlID=%s assign=%s %s\n", calleeID, urlID, assign, remoteAddr)
	mappingMutex.Lock()
	mappingData := mapping[urlID]
	mapping[urlID] = MappingDataType{mappingData.CalleeId,assign}
	mappingMutex.Unlock()
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

	// unregister urlID from dbRegisteredIDs
	err := kvMain.Delete(dbRegisteredIDs, urlID)
	if err!=nil {
		fmt.Printf("# /deletemapping fail to delete id=%s\n", urlID)
		fmt.Fprintf(w,"errorDeleteRegistered")
		return
	}

	fmt.Printf("/deletemapping (%s) delID=%s %s\n", calleeID, urlID, remoteAddr)
	// remove urlID -> calleeID from mapping.map
	mappingMutex.Lock()
	delete(mapping,urlID)
	mappingMutex.Unlock()
	fmt.Fprintf(w,"ok")
}

