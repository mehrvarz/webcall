// WebCall Copyright 2022 timur.mobi. All rights reserved.

package main

import (
	"net/http"
	"fmt"
	"time"
	"os"
	"runtime/pprof"
)

func httpActions(w http.ResponseWriter, r *http.Request, actionString string, calleeID string, remoteAddr string) {
	switch(actionString) {
	case "callback":
		// schedule callback calleeID
		if calleeID=="" {
			fmt.Printf("# /action (%s) fail no calleeID rip=%s\n", actionString, remoteAddr)
			return
		}
		go func() {
			fmt.Printf("/action (%s) callback %s in 10s rip=%s\n", actionString, calleeID, remoteAddr)
			time.Sleep(10 * time.Second)
			// TODO callback 'calleeID' now
			fmt.Printf("/action (%s) callback %s exec now rip=%s\n", actionString, calleeID, remoteAddr)
		}()
	case "001001":
		// dump goroutines
		pprof.Lookup("goroutine").WriteTo(os.Stdout, 1)
	default:
		fmt.Printf("/action (%s) not implemented calleeID=%s rip=%s\n", actionString, calleeID, remoteAddr)
	}

	return
}

