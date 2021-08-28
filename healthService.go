package main

/*
func udpHealthService(port int) error {
	// start listen to UDP port
	udpAddr := fmt.Sprintf(":%d", port)
	//fmt.Printf("udpHealthService ResolveUDPAddr %s\n",udpAddr)
	laddr, err := net.ResolveUDPAddr("udp4", udpAddr)
	if err != nil {
		fmt.Println("# udpHealthService Resolve error\n", err)
		return err
	}
	fmt.Printf("udpHealthService ListenUDP laddr=%v\n", laddr)
	c, err := net.ListenUDP("udp", laddr)
	if err != nil {
		fmt.Println("# udpHealthService Listen error\n", err)
		return err
	}

	// start forever service loop
	for {
		//fmt.Println(TAG,"Read...",c.LocalAddr().String())
		buf := make([]byte, 1024)
		bytes, addr, err := c.ReadFromUDP(buf)
		if err != nil {
			fmt.Printf("# udpHealthService Read error\n", err)
			return err
		}
		clientRemoteAddrIP4 := addr.IP.To4()

		fmt.Printf("udpHealthService client=%v:%v bytes=%d requestData=(%s)\n",
			clientRemoteAddrIP4, addr.Port, bytes, buf[:bytes])
		// TODO here we could verify the request in buf[:bytes]

		// generate response
		//respString := time.Now().Format("2006-01-02 15:04:05")
		httpRequestCountMutex.RLock()
		respString := fmt.Sprintf("%d %d",
			httpRequestCount,
			httpResponseTime.Milliseconds())
		httpRequestCountMutex.RUnlock()
		_, err = c.WriteTo([]byte(respString), addr)
		if err != nil {
			fmt.Println("# udpHealthService write error\n", err)
		} else {
			//fmt.Println("udpHealthService written data no err\n")
		}
	}
}
*/
