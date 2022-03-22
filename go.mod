module github.com/mehrvarz/webcall

go 1.16

require (
	//github.com/SherClockHolmes/webpush-go v1.1.3
	github.com/fasthttp/websocket v1.4.3
	github.com/lesismal/llib v1.1.4
	github.com/lesismal/nbio v1.2.6
	//github.com/pion/turn/v2 v2.0.8
	github.com/mehrvarz/turn/v2 v2.0.12
	github.com/mrjones/oauth v0.0.0-20190623134757-126b35219450
	github.com/pion/logging v0.2.2
	github.com/valyala/fasthttp v1.34.0
	go.etcd.io/bbolt v1.3.6
	gopkg.in/ini.v1 v1.63.0
)

//replace github.com/mehrvarz/turn/v2 => ../turn
//replace github.com/pion/turn/v2 => ../../temp/turn
