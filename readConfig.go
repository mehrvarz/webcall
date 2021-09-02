// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"fmt"
	"strconv"
	"strings"
	"gopkg.in/ini.v1" // https://pkg.go.dev/gopkg.in/go-ini/ini.v1
)

func readIniEntry(configIni *ini.File, keyword string) (string,bool) {
	if configIni==nil {
		return "",false
	}
	if !configIni.Section("").HasKey(keyword) {
		return "",false
	}
	cfgEntry := configIni.Section("").Key(keyword).String()
	commentIdx := strings.Index(cfgEntry, "#")
	if commentIdx >= 0 {
		cfgEntry = cfgEntry[:commentIdx]
	}
	return strings.TrimSpace(cfgEntry),true
}

func readIniBoolean(configIni *ini.File, cfgKeyword string, currentVal bool, defaultValue bool) bool {
	newVal := defaultValue
	cfgValue,ok := readIniEntry(configIni, cfgKeyword)
	if ok && cfgValue!="" {
		if cfgValue == "true" {
			newVal = true
		} else {
			newVal = false
		}
	}
	if currentVal != newVal {
		isDefault:=""; if newVal==defaultValue { isDefault="*" }
		fmt.Printf("%s bool %s=%v %s\n", configFileName, cfgKeyword, newVal, isDefault)
	}
	currentVal = newVal
	return currentVal
}

func readIniInt(configIni *ini.File, cfgKeyword string, currentVal int, defaultValue int, factor int) int {
	newVal := defaultValue
	cfgValue,ok := readIniEntry(configIni, cfgKeyword)
	if ok && cfgValue!="" {
		i64, err := strconv.ParseInt(cfgValue, 10, 64)
		if err != nil {
			fmt.Printf("# %s int  %s=%v err=%v\n", configFileName, cfgKeyword, cfgValue, err)
		} else {
			newVal = int(i64) * factor
		}
	}
	if newVal != currentVal {
		isDefault:=""; if newVal==defaultValue { isDefault="*" }
		fmt.Printf("%s int  %s=%d %s\n", configFileName, cfgKeyword, newVal, isDefault)
	}
	currentVal = newVal
	return currentVal
}

func readIniString(configIni *ini.File, cfgKeyword string, currentVal string, defaultValue string) string {
	newVal := defaultValue
	cfgValue,ok := readIniEntry(configIni, cfgKeyword)
	if ok && cfgValue != "" {
		newVal = cfgValue
	}
	// don't log entries ending in 'Key'
	if newVal!=currentVal && !strings.HasSuffix(cfgKeyword, "Key") {
		isDefault:=""; if newVal==defaultValue { isDefault="*" }
		fmt.Printf("%s str  %s=(%v) %s\n", configFileName, cfgKeyword, newVal, isDefault)
	}
	currentVal = newVal
	return currentVal
}

