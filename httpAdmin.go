// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"net/http"
	"fmt"
	"time"
	"strconv"
	"errors"
	"bytes"
	"encoding/gob"
	"github.com/mehrvarz/webcall/skv"
	bolt "go.etcd.io/bbolt"
)

func httpAdmin(kv skv.SKV, w http.ResponseWriter, r *http.Request, urlPath string, urlID string, remoteAddr string) bool {
	printFunc := func(w http.ResponseWriter, format string, a ...interface{}) {
		// printFunc writes to the console AND to the localhost http client
		fmt.Printf(format, a...)
		fmt.Fprintf(w, format, a...)
	}

	if urlPath=="/dumpuser" {
		bucketName := dbUserBucket
		fmt.Printf("/dumpuser dbName=%s bucketName=%s\n", dbMainName, bucketName)
		db := kv.Db
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(bucketName))
			if b==nil {
				return errors.New("read bucket error "+bucketName)
			}
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var dbUser DbUser
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbUser)
				printFunc(w, "user %20s %d calls=%d p2p=%d/%d talk=%d\n",
					k,
					dbUser.PremiumLevel, dbUser.CallCounter,
					dbUser.LocalP2pCounter, dbUser.RemoteP2pCounter,
					dbUser.ConnectedToPeerSecs)
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpuser err=%v\n", err)
		} else {
			fmt.Printf("/dumpuser no err\n")
		}
		return true
	}

	if urlPath=="/dumpregistered" {
		// show the list of callee-IDs that have been registered and are not yet outdated
		bucketName := dbRegisteredIDs
		fmt.Printf("/dumpregistered dbName=%s bucketName=%s\n", dbMainName, bucketName)
		db := kv.Db
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(bucketName))
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var dbEntry DbEntry
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)
				printFunc(w,"registered id=%s %d=%s rip=%s\n",
					k, // ID
					dbEntry.StartTime, time.Unix(dbEntry.StartTime,0).Format("2006-01-02 15:04:05"),
					dbEntry.Ip)
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpregistered err=%v\n", err)
		} else {
			fmt.Printf("/dumpregistered no err\n")
		}
		return true
	}

	if urlPath=="/dumpblocked" {
		// show the list of callee-IDs that are blocked (for various reasons)
		bucketName := dbBlockedIDs
		fmt.Printf("/dumpblocked dbName=%s bucketName=%s\n", dbMainName, bucketName)
		db := kv.Db
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(bucketName))
			c := b.Cursor()
			for id, v := c.First(); id != nil; id, v = c.Next() {
				var dbEntry DbEntry
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)
				starttime := time.Unix(dbEntry.StartTime,0)
				printFunc(w,"blocked id=%s start=%d=%s rip=%s\n",
					id, dbEntry.StartTime, starttime.Format("2006-01-02 15:04:05"), dbEntry.Ip)
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpblocked err=%v\n", err)
		} else {
			fmt.Printf("/dumpblocked no err\n")
		}
		printFunc(w,"\n")
		return true
	}

	if urlPath=="/deluserid" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /deluserid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]
		urlTimei64, err := strconv.ParseInt(urlTime, 10, 64)
		if err!=nil {
			printFunc(w,"# /deluserid error converting arg 'time'=%d to int64 %v\n",urlTime,err)
			return true
		}
		userKey := fmt.Sprintf("%s_%d",urlID, urlTimei64)
		bucketName := dbUserBucket
		fmt.Printf("/deluserid dbName=%s bucketName=%s\n", dbMainName, bucketName)
		err = kv.Delete(dbUserBucket, userKey)
		if err!=nil {
			printFunc(w,"# /deluserid fail to delete user key=%v %v\n", userKey, err)
		} else {
			printFunc(w,"/deluserid deleted user key=%v\n", userKey)
		}
		fmt.Fprintf(w,"\n")
		return true
	}

	if urlPath=="/delregisteredid" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /delregisteredid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]

		var dbEntry DbEntry
		err := kv.Get(dbRegisteredIDs,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /delregisteredid urlID not found\n")
			return true
		}

		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /delregisteredid time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		bucketName := dbRegisteredIDs
		fmt.Printf("/delregisteredid dbName=%s bucketName=%s\n", dbMainName, bucketName)
		err = kv.Delete(bucketName, urlID)
		if err!=nil {
			printFunc(w,"# /delregisteredid fail to delete blocked id=%s\n", urlID)
		} else {
			printFunc(w,"/delregisteredid deleted id=%s\n", urlID)
		}
		fmt.Fprintf(w,"\n")
		return true
	}

	if urlPath=="/delblockedid" {
		bucketName := dbBlockedIDs
		var dbEntry DbEntry
		err := kv.Get(bucketName,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /delblockedid urlID not found\n")
			return true
		}

		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /delblockedid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]

		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /delblockedid time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		fmt.Printf("/delblockedid dbName=%s bucketName=%s\n", dbMainName, bucketName)

		err = kv.Delete(bucketName, urlID)
		if err!=nil {
			printFunc(w,"# /delblockedid fail to delete id=%s\n", urlID)
		} else {
			printFunc(w,"/delblockedid deleted id=%s\n", urlID)
		}
		fmt.Fprintf(w,"\n")
		return true
	}

	if urlPath=="/makeregistered" {
		// show the list of callee-IDs that have been registered and are not yet outdated
		// ".../makeregistered?id=answie&days=xx&pw=123456"

		// get service days from url-arg
		url_arg_array, ok := r.URL.Query()["sdays"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /makeregistered url arg 'days' not given\n")
			return true
		}
		urlSDaysStr := url_arg_array[0]
		urlSDaysI64, err := strconv.ParseInt(urlSDaysStr, 10, 64)
		if err!=nil {
			printFunc(w,"# /makeregistered error converting 'days'=%s to int %v\n",urlSDaysStr,err)
			return true
		}
		urlSDays := int(urlSDaysI64)

		// service minutes (optional)
		urlSMinutes := 0
		url_arg_array, ok = r.URL.Query()["smin"]
		if !ok || len(url_arg_array[0]) < 1 {
			// ignore
		} else {
			urlSMinutesI64, err := strconv.ParseInt(url_arg_array[0], 10, 64)
			if err!=nil {
				// ignore
			} else {
				urlSMinutes = int(urlSMinutesI64)
			}
		}
		if (urlSDays<=0 && urlSMinutes<=0) /*|| urlTMinutes<0*/ {
			printFunc(w,"# /makeregistered error both 'sdays' and 'smin' or 'tmin' <0\n")
			return true
		}

		// get pw from url-arg
		url_arg_array, ok = r.URL.Query()["pw"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /makeregistered url arg 'pw' not given\n")
			return true
		}
		urlPw := url_arg_array[0]

		// get prem flag from url-arg
		premiumLevel := 0
		_, ok = r.URL.Query()["prem"]
		if ok {
			premiumLevel = 1
		}

		fmt.Printf("/makeregistered dbName=%s\n", dbMainName)

		unixTime := time.Now().Unix()
		dbUserKey := fmt.Sprintf("%s_%d",urlID, unixTime)
		dbUser := DbUser{PremiumLevel:premiumLevel, Ip1:remoteAddr}
		err = kv.Put(dbUserBucket, dbUserKey, dbUser, false)
		if err!=nil {
			printFunc(w,"# /makeregistered error db=%s bucket=%s put key=%s err=%v\n",
				dbMainName,dbUserBucket,urlID,err)
		} else {
			err = kv.Put(dbRegisteredIDs, urlID,
				DbEntry{unixTime, remoteAddr, urlPw}, false)
			if err!=nil {
				printFunc(w,"# /makeregistered error db=%s bucket=%s put key=%s err=%v\n",
					dbMainName,dbRegisteredIDs,urlID,err)
			} else {
				printFunc(w,"/makeregistered db=%s bucket=%s new id=%s prem=%v created\n",
					dbMainName,dbRegisteredIDs,urlID,premiumLevel)
			}
		}
		if err!=nil {
			printFunc(w,"# /makeregistered id=%s err=%v\n", urlID, err)
		} else {
			printFunc(w,"/makeregistered id=%s no err\n", urlID)
		}
		fmt.Fprintf(w,"\n")
		return true
	}

	if urlPath=="/editprem" {
		var dbEntry DbEntry
		err := kv.Get(dbRegisteredIDs,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /editprem urlID=(%s) not found\n",urlID)
			return true
		}

		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /editprem url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]
		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /editprem time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		dbUserKey := fmt.Sprintf("%s_%d",urlID, dbEntry.StartTime)
		var dbUser DbUser
		err = kv.Get(dbUserBucket, dbUserKey, &dbUser)
		if err!=nil {
			fmt.Printf("# /editprem (%s) failed on dbUserBucket\n",urlID)
			return true
		}

		// get prem flag from url-arg
		premiumLevel := 0
		_, ok = r.URL.Query()["prem"]
		if ok {
			premiumLevel = 1
		}
		dbUser.PremiumLevel = premiumLevel

		err = kv.Put(dbUserBucket, dbUserKey, dbUser, false)
		if err!=nil {
			printFunc(w,"# /editprem error db=%s bucket=%s put key=%s err=%v\n",
				dbMainName,dbUserBucket,urlID,err)
		} else {
			printFunc(w,"/editprem db=%s bucket=%s new id=%s prem=%v created\n",
				dbMainName,dbRegisteredIDs,urlID,premiumLevel)
		}
		fmt.Fprintf(w,"\n")
		return true
	}

	return false
}

