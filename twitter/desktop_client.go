// github.com/ChimeraCoder/anaconda
package twitter

import (
	"github.com/mrjones/oauth"
)

func NewDesktopClient(consumerKey, consumerSecret string) *DesktopClient {
	newDesktop := new(DesktopClient)
	newDesktop.OAuthConsumer = oauth.NewConsumer(
		consumerKey,
		consumerSecret,
		oauth.ServiceProvider{
			RequestTokenUrl:   OAUTH_REQUES_TOKEN,
			AuthorizeTokenUrl: OAUTH_AUTH_TOKEN,
			AccessTokenUrl:    OAUTH_ACCESS_TOKEN,
		},
	)
	//Enable debug
	newDesktop.OAuthConsumer.Debug(false)
	return newDesktop
}

type DesktopClient struct {
	Client
	OAuthConsumer *oauth.Consumer
}

func (d *DesktopClient) DoAuth(accessToken *oauth.AccessToken) (*oauth.AccessToken, error) {
	var err error
	d.HttpConn, err = d.OAuthConsumer.MakeHttpClient(accessToken)
	return accessToken,err
}

