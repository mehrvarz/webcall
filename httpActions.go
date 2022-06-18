// WebCall Copyright 2022 timur.mobi. All rights reserved.

package main

import (
	"net/http"
	"fmt"
	//"strings"
	//"time"
	"os"
	"runtime/pprof"
)

func httpActions(w http.ResponseWriter, r *http.Request, actionString string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if cookie==nil {
		fmt.Printf("# /action (%s) fail no cookie %s\n", calleeID, remoteAddr)
		return
	}
	if calleeID=="" {
		fmt.Printf("# /action fail no calleeID %s\n", remoteAddr)
		return
	}
	switch {
	case actionString=="001001":
		// dump goroutines
		if calleeID != adminID {
			fmt.Printf("/action (%s) 001001 dump goroutines not admin (%s)\n", calleeID, remoteAddr)
			return
		}
		fmt.Printf("/action (%s) 001001 dump goroutines exec now %s\n", calleeID, remoteAddr)
		pprof.Lookup("goroutine").WriteTo(os.Stdout, 2)
		return
	/*
	case actionString=="callback":
		// schedule callback calleeID
		fmt.Printf("/action (%s) callback in 10s %s\n", calleeID, remoteAddr)
		go func() {
			time.Sleep(10 * time.Second)
			fmt.Printf("/action (%s) callback not yet implemented %s\n", calleeID, remoteAddr)
			// TODO implement callback 'calleeID'
		}()
		return
	*/
	/*
	case strings.HasPrefix(actionString, "block:"):
		blockID := actionString[6:]
		if calleeID != adminID {
			fmt.Printf("/action (%s) block fail not admin (%s) %s\n", blockID, calleeID, remoteAddr)
			return
		}
		// we look for blockID either in the local or in the global hubmap
		reportHiddenCallee := true
		reportBusyCallee := true
		ejectOn1stFound := true
		glUrlID, _, _, err := GetOnlineCallee(blockID, ejectOn1stFound, reportBusyCallee, 
			reportHiddenCallee, remoteAddr, "/online")
		if err != nil {
			// error
			fmt.Printf("# /action (%s/%s) block (%s) %s err=%v\n",
				calleeID, glUrlID, blockID, remoteAddr, err)
			fmt.Fprintf(w, "error")
			return
		}
		if glUrlID == "" {
			// blockID is not online
			fmt.Printf("/action (%s) block (%s) fail not online %s\n", calleeID, blockID, remoteAddr)
			return
		}

		// the next login attempt of blockID/globalID will be denied to break it's reconnecter loop
		fmt.Printf("/action (%s/%s) block (%s) simulate %s\n", calleeID, glUrlID, blockID, remoteAddr)
		blockMapMutex.Lock()
		blockMap[glUrlID] = time.Now()
		blockMapMutex.Unlock()
		fmt.Fprintf(w, "ok")
		return
	*/
	default:
		fmt.Printf("/action (%s) not implemented (%s) %s\n", calleeID, actionString, remoteAddr)
	}

	return
}

