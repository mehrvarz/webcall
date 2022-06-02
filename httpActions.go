// WebCall Copyright 2022 timur.mobi. All rights reserved.

package main

import (
	"net/http"
	"fmt"
	"strings"
	"time"
	"os"
	"runtime/pprof"
)

func httpActions(w http.ResponseWriter, r *http.Request, actionString string, calleeID string, remoteAddr string) {
	switch {
	case actionString=="001001":
		// dump goroutines
		if calleeID != adminID { // TODO make configurable
			fmt.Printf("/action 001001 dump goroutines (%s) not admin %s\n", calleeID, remoteAddr)
			return
		}
		fmt.Printf("/action 001001 dump goroutines (%s) exec now %s\n", calleeID, remoteAddr)
		pprof.Lookup("goroutine").WriteTo(os.Stdout, 2)
		return
	case actionString=="callback":
		// schedule callback calleeID
		if calleeID=="" {
			fmt.Printf("# /action callback fail no calleeID %s\n", remoteAddr)
			return
		}
		fmt.Printf("/action callback (%s) in 10s %s\n", calleeID, remoteAddr)
		go func() {
			time.Sleep(10 * time.Second)
			fmt.Printf("/action callback (%s) not yet implemented %s\n", calleeID, remoteAddr)
			// TODO implement callback 'calleeID'
		}()
		return
	case strings.HasPrefix(actionString, "block:"):
		blockID := actionString[6:]
		if calleeID != adminID {
			fmt.Printf("/action block (%s) no admin (%s) %s\n", blockID, calleeID, remoteAddr)
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
			fmt.Printf("# /action block (%s/%s) %s (%s) err=%v\n",
				blockID, glUrlID, remoteAddr, calleeID, err)
			fmt.Fprintf(w, "error")
			return
		}
		if glUrlID == "" {
			// blockID is not online
			fmt.Printf("/action block (%s) not online %s (%s)\n", blockID, remoteAddr, calleeID)
			return
		}

		// the next login attempt of blockID/globalID will be denied to break it's reconnecter loop
		fmt.Printf("/action block (%s/%s) simulate blocked %s (%s)\n", blockID, glUrlID, remoteAddr, calleeID)
		blockMapMutex.Lock()
		blockMap[glUrlID] = time.Now()
		blockMapMutex.Unlock()
		fmt.Fprintf(w, "ok")
		return
	default:
		fmt.Printf("/action (%s) not implemented (%s) %s\n", actionString, calleeID, remoteAddr)
	}

	return
}

