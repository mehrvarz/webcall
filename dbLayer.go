// WebCall Copyright 2022 timur.mobi. All rights reserved.
// By default dbLayer.go will forward all calls to skvLayer.go
// In the future other db-layers may be implemented
package main

func isLocalDb() bool {
	return true
}

func GetOnlineCallee(calleeID string, ejectOn1stFound bool, reportBusyCallee bool, reportHiddenCallee bool, callerIpAddr string, /*occupy bool,*/ comment string) (string,*Hub,*Hub,error) { // actual calleeID, hostingServerIp
	urlID, locHub, err := locGetOnlineCallee(calleeID, ejectOn1stFound, reportBusyCallee, reportHiddenCallee,
		callerIpAddr, /*occupy,*/ comment)
	return urlID, locHub, nil, err
}

func StoreCalleeInHubMap(key string, multiCallees string, remoteAddrWithPort string, wsClientID uint64, skipConfirm bool) (string,int64,error) {
	return locStoreCalleeInHubMap(key, nil, multiCallees, remoteAddrWithPort, wsClientID, skipConfirm)
}

func SetUnHiddenForCaller(calleeId string, callerIp string) (error) {
	return locSetUnHiddenForCaller(calleeId, callerIp)
}

func StoreCallerIpInHubMap(calleeId string, callerIp string, skipConfirm bool) error {
	return locStoreCallerIpInHubMap(calleeId, callerIp, skipConfirm)
}

func SetCalleeHiddenState(calleeId string, hidden bool) (error) {
	return locSetCalleeHiddenState(calleeId, hidden)
}

func GetRandomCalleeID() (string,error) {
	return locGetRandomCalleeID()
}

func SearchCallerIpInHubMap(ipAddr string) (bool,string,error) {
	return locSearchCallerIpInHubMap(ipAddr)
}

func DeleteFromHubMap(globalID string) (int64,int64) {
	hublen,err := locDeleteFromHubMap(globalID)
	if err!=nil {
		return int64(0),int64(0)
	}
	return hublen,int64(0)
}

