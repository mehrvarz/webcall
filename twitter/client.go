// github.com/ChimeraCoder/anaconda
package twitter

import (
	"encoding/json"
	"errors"
	"strings"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"bytes"
)

const (
	//Basic OAuth related URLs
	OAUTH_REQUES_TOKEN string = "https://api.twitter.com/oauth/request_token"
	OAUTH_AUTH_TOKEN   string = "https://api.twitter.com/oauth/authorize"
	OAUTH_ACCESS_TOKEN string = "https://api.twitter.com/oauth/access_token"

	//List API URLs
	API_BASE           string = "https://api.twitter.com/1.1/"
	API_TIMELINE       string = API_BASE + "statuses/home_timeline.json"
	API_FOLLOWERS_IDS  string = API_BASE + "followers/ids.json"				// 15 requests per 15-min
	API_FOLLOWERS_LIST string = API_BASE + "followers/list.json"
	API_FOLLOWER_INFO  string = API_BASE + "users/show.json"				// 900 requests per 15-min
	API_LISTS          string = API_BASE + "lists/statuses.json"
	API_STATUS         string = API_BASE + "statuses/show.json"
	API_TWEET          string = API_BASE + "statuses/update.json"
	API_DIRECT         string = API_BASE + "direct_messages/events/new.json"
)

type Client struct {
	HttpConn *http.Client
	HttpCli  *http.Client
}

func (c *Client) HasAuth() bool {
	return c.HttpConn != nil
}

func (c *Client) BasicQuery(queryString string) ([]byte, error) {
	if c.HttpConn == nil {
		return nil, errors.New("No Client OAuth")
	}

	fmt.Printf("BasicQuery queryString=%s\r\n",queryString)
	response, err := c.HttpConn.Get(queryString)

	/*
	// tmtmtm TODO: not sure how to set the timeout
	if c.HttpCli==nil {
		timeout := time.Duration(10 * time.Second)
		c.HttpCli = *c.HttpConn{
			Timeout: timeout,
		}
	}
	response, err := c.HttpCli.Get(queryString)
	*/
	
	/*
	if err != nil {
		log.Fatal(err)
	}
	defer response.Body.Close()

	bits, err := ioutil.ReadAll(response.Body)
	return bits, err
	*/
	if err == nil {
		defer response.Body.Close()
		if err == nil {
			bits, err := ioutil.ReadAll(response.Body)
			return bits, err
		}
	}
	return nil, err
}

func (c *Client) PostQuery(queryString string, contentType string) ([]byte, error) {
	if c.HttpConn == nil {
		return nil, errors.New("No Client OAuth")
	}

	//fmt.Printf("PostQuery queryString=%s\r\n",queryString)
	response, err := c.HttpConn.Post(queryString,contentType,nil)

	if err == nil {
		defer response.Body.Close()
		if err == nil {
			bits, err := ioutil.ReadAll(response.Body)
			return bits, err
		}
	}
	return nil, err
}


func (c *Client) QueryTimeLine(count int, older_than_id int64, newer_than_id int64 ) (TimelineTweets, []byte, error) {
	requesURL := fmt.Sprintf("%s?count=%d&tweet_mode=extended", API_TIMELINE, count)
	if newer_than_id>0 {
		arg := fmt.Sprintf("&since_id=%d",newer_than_id)
		requesURL += arg
	} else if older_than_id>0 {
		arg := fmt.Sprintf("&max_id=%d",older_than_id)
		requesURL += arg
	}
	//fmt.Printf("requesURL=%s\r\n",requesURL)
	data, err := c.BasicQuery(requesURL)
	if err==nil {
		//fmt.Printf("data=[%s]\r\n",data)
		ret := TimelineTweets{}
		err = json.Unmarshal(data, &ret)
		return ret, data, err
	}
	return nil, data, err
}

func (c *Client) QueryStatus(id int64 ) (*TimelineTweet, []byte, error) {
	requesURL := fmt.Sprintf("%s?id=%d&tweet_mode=extended", API_STATUS,id)
	//fmt.Printf("QueryStatus requesURL=%s\r\n",requesURL)
	data, err := c.BasicQuery(requesURL)
	if err==nil {
		//fmt.Printf("QueryStatus data=[%s]\r\n",data)
		ret := TimelineTweet{}
		err = json.Unmarshal(data, &ret)
		if err==nil && ret.Id==0 {
			ret := ErrorsTweet{}
			err = json.Unmarshal(data, &ret)
//fmt.Printf("QueryStatus Unmarshal err=[%v] ret.Errors[0].Code=%d [%s]\r\n",err,ret.Errors[0].Code,ret.Errors[0].Message)
			if err==nil && ret.Errors!=nil && ret.Errors[0].Code>0 {
				return nil, data, errors.New(ret.Errors[0].Message)
			}
		}
		//fmt.Printf("QueryStatus Unmarshal err=[%v] ret.Id=%d\r\n",err,ret.Id)
		return &ret, data, err
	}
	return nil, data, err
}

func (c *Client) QueryList(name string, owner_screen_name string, count int, older_than_id int64, newer_than_id int64 ) (TimelineTweets, []byte, error) {
	requesURL := fmt.Sprintf("%s?slug=%s&owner_screen_name=%s&count=%d&tweet_mode=extended", API_LISTS, name, owner_screen_name, count)
	if newer_than_id>0 {
		arg := fmt.Sprintf("&since_id=%d",newer_than_id)
		requesURL += arg
	} else if older_than_id>0 {
		arg := fmt.Sprintf("&max_id=%d",older_than_id)
		requesURL += arg
	}
	//fmt.Printf("QueryList requesURL %s\n",requesURL)
	data, err := c.BasicQuery(requesURL)
	//fmt.Printf("QueryList data %s\n",string(data))
	ret := TimelineTweets{}
	err = json.Unmarshal(data, &ret)
	return ret, data, err
}

func (c *Client) QueryFollower(count int) (Followers, []byte, error) {
	requesURL := fmt.Sprintf("%s?count=%d", API_FOLLOWERS_LIST, count)
	data, err := c.BasicQuery(requesURL)
	ret := Followers{}
	err = json.Unmarshal(data, &ret)
	return ret, data, err
}

func (c *Client) QueryFollowerIDs(count int) (FollowerIDs, []byte, error) {
	requesURL := fmt.Sprintf("%s?count=%d", API_FOLLOWERS_IDS, count)
	data, err := c.BasicQuery(requesURL)
	var ret FollowerIDs
	err = json.Unmarshal(data, &ret)
	return ret, data, err
}

func (c *Client) QueryFollowerById(id int) (UserDetail, []byte, error) {
	requesURL := fmt.Sprintf("%s?user_id=%d", API_FOLLOWER_INFO, id)
	data, err := c.BasicQuery(requesURL)
	var ret UserDetail
	err = json.Unmarshal(data, &ret)
	return ret, data, err
}

func (c *Client) QueryFollowerByName(name string) (UserDetail, []byte, error) {
	requesURL := fmt.Sprintf("%s?screen_name=%s", API_FOLLOWER_INFO, name)
	data, err := c.BasicQuery(requesURL)
	var ret UserDetail
	err = json.Unmarshal(data, &ret)
	return ret, data, err
}

func (c *Client) SendTweet(msg string) ([]byte, error) {
	requesURL := fmt.Sprintf("%s?status=%s", API_TWEET, url.QueryEscape(msg))
	respdata, err := c.PostQuery(requesURL,"") //"application/x-www-form-urlencoded")
fmt.Printf("SendTweet requesURL=(%v) err=%v response=[%s]\n",requesURL,err,respdata)
	if err==nil {
		// err==nil does not mean everything has worked 
		// if respdata contains "errors", we must evaluate it
		// for instance "code":214 has a message attached
		// "message":"event.message_create.target.recipient_id: 'falafelxxl' is not a valid Long"
		// json parse
		if strings.Index(string(respdata),"\"errors\"")>=0 {
			var ret ErrorsTweet
			err = json.Unmarshal(respdata, &ret)
			fmt.Printf("# SendTweet respdata [%s] err=%v\n",respdata,err)
			if err==nil {
				if ret.Errors[0].Code != 0 {
					err = errors.New(ret.Errors[0].Message)
				}
			}
		}
	}
	return respdata, err
}

func (c *Client) SendDirect(recipient string, msg string) ([]byte, error) {
	if c.HttpConn == nil {
		return nil, errors.New("No Client OAuth")
	}

	fmt.Printf("SendDirect msg=%s\r\n",msg)

	// we use the following API to send twitter direct msgs
	// https://developer.twitter.com/en/docs/twitter-api/v1/direct-messages/sending-and-receiving/api-reference/new-event

/* twitter direct msg json api
'{"event": {"type": "message_create", "message_create": {"target": {"recipient_id": "RECIPIENT_USER_ID"}, "message_data": {"text": "Hello World!"}}}}'
twurl -A 'Content-type: application/json' -X POST /1.1/direct_messages/events/new.json -d '{"event": {"type": "message_create", "message_create": {"target": {"recipient_id": "RECIPIENT_USER_ID"}, "message_data": {"text": "Hello World!"}}}}'
*/

	reqBody := fmt.Sprintf("{\"event\": {\"type\": \"message_create\", \"message_create\": {\"target\": {\"recipient_id\": \"%s\"}, \"message_data\": {\"text\": \"%s\"}}}}}",recipient,msg)
	response, err := c.HttpConn.Post(API_DIRECT,"application/json",bytes.NewBuffer([]byte(reqBody)))
	if err != nil {
		return nil, errors.New("post error")
	}
	defer response.Body.Close()
	respdata, err := ioutil.ReadAll(response.Body)
	fmt.Printf("SendDirect response=[%s]\n",respdata)
/*
response=[{"event":{"type":"message_create","id":"1391575599735525381","created_timestamp":"1620612451858","message_create":{"target":{"recipient_id":"218447389"},"sender_id":"1388595296205250560","message_data":{"text":"A call for you https:\/\/t.co\/tmp115RC8V \/user\/123456","entities":{"hashtags":[],"symbols":[],"user_mentions":[],"urls":[{"url":"https:\/\/t.co\/tmp115RC8V","expanded_url":"http:\/\/timur.mobi","display_url":"timur.mobi","indices":[15,38]}]}}}}}]

response=[{"event":{"type":"message_create","id":"1392278525663645703","created_timestamp":"1620780042459","message_create":{"target":{"recipient_id":"1065529529052143616"},"sender_id":"1388595296205250560","message_data":{"text":"A caller is waiting for you now","entities":{"hashtags":[],"symbols":[],"user_mentions":[],"urls":[]}}}}}]

response=[{"errors":[{"code":214,"message":"event.message_create.target.recipient_id: 'falafelxxl' is not a valid Long"}]}]
*/
	if err==nil {
		// err==nil does not mean everything has worked 
		// if respdata contains "errors", we must evaluate it
		// for instance "code":214 has a message attached
		// "message":"event.message_create.target.recipient_id: 'falafelxxl' is not a valid Long"
		// json parse
		if strings.Index(string(respdata),"\"errors\"")>=0 {
			var ret ErrorsTweet
			err = json.Unmarshal(respdata, &ret)
			if err==nil {
				if ret.Errors[0].Code != 0 {
					err = errors.New(ret.Errors[0].Message)
				}
			}
		}
	}
	return respdata, err
}

func (c *Client) DeleteTweet(id string) ([]byte, error) {
	requesURL := fmt.Sprintf("%sstatuses/destroy/%s.json", API_BASE, id)
	//fmt.Printf("DeleteTweet requesURL=(%s)\n",requesURL)
	respdata, err := c.PostQuery(requesURL,"")
	//fmt.Printf("DeleteTweet respdata=[%s]\n",respdata)
	if err==nil {
		// err==nil does not mean everything has worked 
		// if respdata contains "errors", we must evaluate it
		// for instance "code":214 has a message attached
		// "message":"event.message_create.target.recipient_id: 'falafelxxl' is not a valid Long"
		// json parse
		if strings.Index(string(respdata),"\"errors\"")>=0 {
			var ret ErrorsTweet
			err = json.Unmarshal(respdata, &ret)
			if err==nil {
				if ret.Errors[0].Code != 0 {
					err = errors.New(ret.Errors[0].Message)
				}
			}
		}
	}
	return respdata, err
}

