module github.com/mehrvarz/webcall

go 1.16

require (
	github.com/lesismal/llib v1.1.4
	github.com/lesismal/nbio v1.2.6
	github.com/mattn/go-mastodon v0.0.6
	github.com/mehrvarz/turn/v2 v2.0.12
	github.com/mrjones/oauth v0.0.0-20190623134757-126b35219450
	github.com/nxadm/tail v1.4.8
	github.com/pion/logging v0.2.2
	go.etcd.io/bbolt v1.3.6
	golang.org/x/crypto v0.0.0-20220314234659-1baeb1ce4c0b
	golang.org/x/net v0.7.0
	gopkg.in/ini.v1 v1.63.0
)

//replace github.com/mattn/go-mastodon => ../go-mastodon
