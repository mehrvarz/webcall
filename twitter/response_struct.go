// github.com/ChimeraCoder/anaconda
package twitter

import "time"

type TimelineTweet struct {
	Contributors                []int64                `json:"contributors"`
	Coordinates                 *Coordinates           `json:"coordinates"`
	CreatedAt                   string                 `json:"created_at"`
	DisplayTextRange            []int                  `json:"display_text_range"`
	Entities                    Entities               `json:"entities"`
	ExtendedEntities            Entities               `json:"extended_entities"`
	ExtendedTweet               ExtendedTweet          `json:"extended_tweet"`
	FavoriteCount               int                    `json:"favorite_count"`
	Favorited                   bool                   `json:"favorited"`
	FilterLevel                 string                 `json:"filter_level"`
	Full_text                   string                 `json:"full_text"`
	HasExtendedProfile          bool                   `json:"has_extended_profile"`
	Id                          int64                  `json:"id"`
	IdStr                       string                 `json:"id_str"`
	InReplyToScreenName         string                 `json:"in_reply_to_screen_name"`
	InReplyToStatusID           int64                  `json:"in_reply_to_status_id"`
	InReplyToStatusIdStr        string                 `json:"in_reply_to_status_id_str"`
	InReplyToUserID             int64                  `json:"in_reply_to_user_id"`
	InReplyToUserIdStr          string                 `json:"in_reply_to_user_id_str"`
	IsTranslationEnabled        bool                   `json:"is_translation_enabled"`
	Lang                        string                 `json:"lang"`
	Place                		interface{}            `json:"place"`
	QuotedStatusID              int64                  `json:"quoted_status_id"`
	QuotedStatusIdStr           string                 `json:"quoted_status_id_str"`
	QuotedStatus                *TimelineTweet         `json:"quoted_status"`
	PossiblySensitive           bool                   `json:"possibly_sensitive"`
	PossiblySensitiveAppealable bool                   `json:"possibly_sensitive_appealable"`
	RetweetCount                int                    `json:"retweet_count"`
	Retweeted                   bool                   `json:"retweeted"`
	RetweetedStatus             *TimelineTweet         `json:"retweeted_status"`
	Source                      string                 `json:"source"`
	Scopes                      map[string]interface{} `json:"scopes"`
	Text                        string                 `json:"text"`
	User                        User                   `json:"user"`
	WithheldCopyright           bool                   `json:"withheld_copyright"`
	WithheldInCountries         []string               `json:"withheld_in_countries"`
	WithheldScope               string                 `json:"withheld_scope"`

	CreatedAtTime				time.Time	// for display (sometimes the given time is wrong)
	ReceivedAtTime				time.Time	// for sorting (includes prio)
	TtlMinutes                  int

	CardImage                   string
	CardImageBrightness         int
	CardImageFileSize           int
	CardImageWidth				int
	CardImageHeight				int
	CardImageMime               string
	CardTitle                   string
	CardDescr                   string
	CardLink                    string
	// next two entries are not useful if this TimelineTweet is attached as a retweeted or quoted msg
	// this TimelineTweet must be a main msg for these entries to be reliable
	Shown                       bool
	ShownTime                   time.Time
	ShownClearedForAutomode     bool
	ShownSetWhileInAutomode     bool
	
	FeedSource                  string
	DisplayMessage				string
	MainLink                    string	// main external link (currently not for rss)
	SrcLink                     string	// not for twitter; rss only

	ReplySource                 bool	// true if this msg is "inreply"; set by fetchTwitterComTweet()

	QuotedInitialState			int
}

type TimelineTweets []TimelineTweet

// {"errors":[{"message":"Sorry, that page does not exist","code":34}]}
// {"errors":[{"code":136,"message":"You have been blocked from the author of this tweet."}]}
type ErrorsTweet struct {
	Errors []struct {
		Code					int				`json:"code"`
		Message					string			`json:"message"`
	}
}

// Could also use User, since the fields match, but only these fields are possible in Contributor
type Contributor struct {
	Id         int64  `json:"id"`
	IdStr      string `json:"id_str"`
	ScreenName string `json:"screen_name"`
}

type Coordinates struct {
	Coordinates [2]float64 `json:"coordinates"` // Coordinate always has to have exactly 2 values
	Type        string     `json:"type"`
}

type ExtendedTweet struct {
	FullText         string   `json:"full_text"`
	DisplayTextRange []int    `json:"display_text_range"`
	Entities         Entities `json:"entities"`
	ExtendedEntities Entities `json:"extended_entities"`
}

type Entities    struct {
	Hashtags []struct{
		Text        string `json:"text"`
		Indices     []int  `json:"indices"`
	} `json:"hashtags"`
	Symbols  []interface{} `json:"symbols"`
	Urls     []struct {
		DisplayURL  string `json:"display_url"`
		ExpandedURL string `json:"expanded_url"`
		Indices     []int  `json:"indices"`
		URL         string `json:"url"`
	} `json:"urls"`
	UserMentions []struct {
		ID         int64  `json:"id"`
		IDStr      string `json:"id_str"`
		Indices    []int  `json:"indices"`
		Name       string `json:"name"`
		ScreenName string `json:"screen_name"`
	} `json:"user_mentions"`
	Media []struct {
		ID         int64  `json:"id"`
		IDStr      string `json:"id_str"`
		Indices    []int  `json:"indices"`
		MediaURL   string `json:"media_url"`
		MediaURLS  string `json:"media_url_https"`
		URL         string `json:"url"`
		DisplayURL  string `json:"display_url"`
		ExpandedURL string `json:"expanded_url"`
		Type        string `json:"type"`
		Brightness int
		FileSize   int

		Sizes struct {
			Small struct {
				W int `json:"w"`
				H int `json:"h"`
				Resize string `json:"resize"`
			} `json:"small"`
			Thumb struct {
				W int `json:"w"`
				H int `json:"h"`
				Resize string `json:"resize"`
			} `json:"thumb"`
			Medium struct {
				W int `json:"w"`
				H int `json:"h"`
				Resize string `json:"resize"`
			} `json:"medium"`
			Large struct {
				W int `json:"w"`
				H int `json:"h"`
				Resize string `json:"resize"`
			} `json:"large"`
		} `json:"sizes"`

		VideoInfo struct {
			AspetRatio []int `json:"aspect_ratio"`
			DurationMillis int `json:"duration_millis"`
			Variants [] struct {
				Bitrate int `json:"bitrate"`
				ContentType string `json:"content_type"`
				URL string `json:"url"`
			} `json:"variants"`
		} `json:"video_info"`
	} `json:"media"`
	Polls []struct {
		Options []struct {
			Position   int    `json:"position"`
			Text       string `json:"text"`
		} `json:"options"`
		EndDatetime string `json:"end_datetime"`
		DurationMinutes int   `json:"duration_minutes"`
		
	} `json:"polls"`
}

type 	User                 struct {
	ID          int64    `json:"id"`
	IDStr       string `json:"id_str"`
	Name        string `json:"name"`
	ScreenName  string `json:"screen_name"`
	Location    string `json:"location"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Entities    struct {
		URL struct {
			Urls []struct {
				URL         string `json:"url"`
				ExpandedURL string `json:"expanded_url"`
				DisplayURL  string `json:"display_url"`
				Indices     []int  `json:"indices"`
			} `json:"urls"`
		} `json:"url"`
		Description struct {
			Urls []interface{} `json:"urls"`
		} `json:"description"`
	} `json:"entities"`
	Protected                      bool   `json:"protected"`
	FollowersCount                 int    `json:"followers_count"`
	FriendsCount                   int    `json:"friends_count"`
	ListedCount                    int    `json:"listed_count"`
	CreatedAt                      string `json:"created_at"`
	FavouritesCount                int    `json:"favourites_count"`
	UtcOffset                      int    `json:"utc_offset"`
	TimeZone                       string `json:"time_zone"`
	GeoEnabled                     bool   `json:"geo_enabled"`
	Verified                       bool   `json:"verified"`
	StatusesCount                  int    `json:"statuses_count"`
	Lang                           string `json:"lang"`
	ContributorsEnabled            bool   `json:"contributors_enabled"`
	IsTranslator                   bool   `json:"is_translator"`
	IsTranslationEnabled           bool   `json:"is_translation_enabled"`
	ProfileBackgroundColor         string `json:"profile_background_color"`
	ProfileBackgroundImageURL      string `json:"profile_background_image_url"`
	ProfileBackgroundImageURLHTTPS string `json:"profile_background_image_url_https"`
	ProfileBackgroundTile          bool   `json:"profile_background_tile"`
	ProfileImageURL                string `json:"profile_image_url"`
	ProfileImageURLHTTPS           string `json:"profile_image_url_https"`
	ProfileBannerURL               string `json:"profile_banner_url"`
	ProfileLinkColor               string `json:"profile_link_color"`
	ProfileSidebarBorderColor      string `json:"profile_sidebar_border_color"`
	ProfileSidebarFillColor        string `json:"profile_sidebar_fill_color"`
	ProfileTextColor               string `json:"profile_text_color"`
	ProfileUseBackgroundImage      bool   `json:"profile_use_background_image"`
	HasExtendedProfile             bool   `json:"has_extended_profile"`
	DefaultProfile                 bool   `json:"default_profile"`
	DefaultProfileImage            bool   `json:"default_profile_image"`
	Following                      bool   `json:"following"`
	FollowRequestSent              bool   `json:"follow_request_sent"`
	Notifications                  bool   `json:"notifications"`

	ProfileImageBrightness         int
	ProfileImageFileSize           int
	ProfileImageWidth              int
	ProfileImageHeight             int
}

type Followers struct {
	Users []struct {
		ID                             int64       `json:"id"`
		IDStr                          string      `json:"id_str"`
		Name                           string      `json:"name"`
		ScreenName                     string      `json:"screen_name"`
		Location                       string      `json:"location"`
		ProfileLocation                interface{} `json:"profile_location"`
		URL                            interface{} `json:"url"`
		Description                    string      `json:"description"`
		Protected                      bool        `json:"protected"`
		FollowersCount                 int         `json:"followers_count"`
		FriendsCount                   int         `json:"friends_count"`
		ListedCount                    int         `json:"listed_count"`
		CreatedAt                      string      `json:"created_at"`
		FavouritesCount                int         `json:"favourites_count"`
		UtcOffset                      interface{} `json:"utc_offset"`
		TimeZone                       interface{} `json:"time_zone"`
		GeoEnabled                     bool        `json:"geo_enabled"`
		Verified                       bool        `json:"verified"`
		StatusesCount                  int         `json:"statuses_count"`
		Lang                           string      `json:"lang"`
		ContributorsEnabled            bool        `json:"contributors_enabled"`
		IsTranslator                   bool        `json:"is_translator"`
		IsTranslationEnabled           bool        `json:"is_translation_enabled"`
		ProfileBackgroundColor         string      `json:"profile_background_color"`
		ProfileBackgroundImageURL      string      `json:"profile_background_image_url"`
		ProfileBackgroundImageURLHTTPS string      `json:"profile_background_image_url_https"`
		ProfileBackgroundTile          bool        `json:"profile_background_tile"`
		ProfileImageURL                string      `json:"profile_image_url"`
		ProfileImageURLHTTPS           string      `json:"profile_image_url_https"`
		ProfileLinkColor               string      `json:"profile_link_color"`
		ProfileSidebarBorderColor      string      `json:"profile_sidebar_border_color"`
		ProfileSidebarFillColor        string      `json:"profile_sidebar_fill_color"`
		ProfileTextColor               string      `json:"profile_text_color"`
		ProfileUseBackgroundImage      bool        `json:"profile_use_background_image"`
		DefaultProfile                 bool        `json:"default_profile"`
		DefaultProfileImage            bool        `json:"default_profile_image"`
		Following                      bool        `json:"following"`
		FollowRequestSent              bool        `json:"follow_request_sent"`
		Notifications                  bool        `json:"notifications"`
		Muting                         bool        `json:"muting"`
	} `json:"users"`
	NextCursor        int64  `json:"next_cursor"`
	NextCursorStr     string `json:"next_cursor_str"`
	PreviousCursor    int    `json:"previous_cursor"`
	PreviousCursorStr string `json:"previous_cursor_str"`
}

type FollowerIDs struct {
	Ids               []interface{} `json:"ids"`
	NextCursor        int64         `json:"next_cursor"`
	NextCursorStr     string        `json:"next_cursor_str"`
	PreviousCursor    int           `json:"previous_cursor"`
	PreviousCursorStr string        `json:"previous_cursor_str"`
}

type UserDetail struct {
	ContributorsEnabled bool   `json:"contributors_enabled"`
	CreatedAt           string `json:"created_at"`
	DefaultProfile      bool   `json:"default_profile"`
	DefaultProfileImage bool   `json:"default_profile_image"`
	Description         string `json:"description"`
	Entities            struct {
		Description struct {
			Urls []interface{} `json:"urls"`
		} `json:"description"`
		URL struct {
			Urls []struct {
				DisplayURL  string `json:"display_url"`
				ExpandedURL string `json:"expanded_url"`
				Indices     []int  `json:"indices"`
				URL         string `json:"url"`
			} `json:"urls"`
		} `json:"url"`
	} `json:"entities"`
	FavouritesCount                int         `json:"favourites_count"`
	FollowRequestSent              bool        `json:"follow_request_sent"`
	FollowersCount                 int         `json:"followers_count"`
	Following                      bool        `json:"following"`
	FriendsCount                   int         `json:"friends_count"`
	GeoEnabled                     bool        `json:"geo_enabled"`
	ID                             int64       `json:"id"`
	IDStr                          string      `json:"id_str"`
	IsTranslationEnabled           bool        `json:"is_translation_enabled"`
	IsTranslator                   bool        `json:"is_translator"`
	Lang                           string      `json:"lang"`
	ListedCount                    int         `json:"listed_count"`
	Location                       string      `json:"location"`
	Name                           string      `json:"name"`
	Notifications                  bool        `json:"notifications"`
	ProfileBackgroundColor         string      `json:"profile_background_color"`
	ProfileBackgroundImageURL      string      `json:"profile_background_image_url"`
	ProfileBackgroundImageURLHTTPS string      `json:"profile_background_image_url_https"`
	ProfileBackgroundTile          bool        `json:"profile_background_tile"`
	ProfileBannerURL               string      `json:"profile_banner_url"`
	ProfileImageURL                string      `json:"profile_image_url"`
	ProfileImageURLHTTPS           string      `json:"profile_image_url_https"`
	ProfileLinkColor               string      `json:"profile_link_color"`
	ProfileLocation                interface{} `json:"profile_location"`
	ProfileSidebarBorderColor      string      `json:"profile_sidebar_border_color"`
	ProfileSidebarFillColor        string      `json:"profile_sidebar_fill_color"`
	ProfileTextColor               string      `json:"profile_text_color"`
	ProfileUseBackgroundImage      bool        `json:"profile_use_background_image"`
	Protected                      bool        `json:"protected"`
	ScreenName                     string      `json:"screen_name"`
	Status                         struct {
		Contributors interface{} `json:"contributors"`
		Coordinates  interface{} `json:"coordinates"`
		CreatedAt    string      `json:"created_at"`
		Entities     struct {
			Hashtags []interface{} `json:"hashtags"`
			Symbols  []interface{} `json:"symbols"`
			Urls     []struct {
				DisplayURL  string `json:"display_url"`
				ExpandedURL string `json:"expanded_url"`
				Indices     []int  `json:"indices"`
				URL         string `json:"url"`
			} `json:"urls"`
			UserMentions []struct {
				ID         int64  `json:"id"`
				IDStr      string `json:"id_str"`
				Indices    []int  `json:"indices"`
				Name       string `json:"name"`
				ScreenName string `json:"screen_name"`
			} `json:"user_mentions"`
		} `json:"entities"`
		FavoriteCount        int         `json:"favorite_count"`
		Favorited            bool        `json:"favorited"`
		Geo                  interface{} `json:"geo"`
		ID                   int64       `json:"id"`
		IDStr                string      `json:"id_str"`
		InReplyToScreenName  interface{} `json:"in_reply_to_screen_name"`
		InReplyToStatusID    interface{} `json:"in_reply_to_status_id"`
		InReplyToStatusIDStr interface{} `json:"in_reply_to_status_id_str"`
		InReplyToUserID      interface{} `json:"in_reply_to_user_id"`
		InReplyToUserIDStr   interface{} `json:"in_reply_to_user_id_str"`
		Lang                 string      `json:"lang"`
		Place                interface{} `json:"place"`
		PossiblySensitive    bool        `json:"possibly_sensitive"`
		RetweetCount         int         `json:"retweet_count"`
		Retweeted            bool        `json:"retweeted"`
		RetweetedStatus      struct {
			Contributors interface{} `json:"contributors"`
			Coordinates  interface{} `json:"coordinates"`
			CreatedAt    string      `json:"created_at"`
			Entities     struct {
				Hashtags []interface{} `json:"hashtags"`
				Symbols  []interface{} `json:"symbols"`
				Urls     []struct {
					DisplayURL  string `json:"display_url"`
					ExpandedURL string `json:"expanded_url"`
					Indices     []int  `json:"indices"`
					URL         string `json:"url"`
				} `json:"urls"`
				UserMentions []interface{} `json:"user_mentions"`
			} `json:"entities"`
			FavoriteCount        int         `json:"favorite_count"`
			Favorited            bool        `json:"favorited"`
			Geo                  interface{} `json:"geo"`
			ID                   int64       `json:"id"`
			IDStr                string      `json:"id_str"`
			InReplyToScreenName  interface{} `json:"in_reply_to_screen_name"`
			InReplyToStatusID    interface{} `json:"in_reply_to_status_id"`
			InReplyToStatusIDStr interface{} `json:"in_reply_to_status_id_str"`
			InReplyToUserID      interface{} `json:"in_reply_to_user_id"`
			InReplyToUserIDStr   interface{} `json:"in_reply_to_user_id_str"`
			Lang                 string      `json:"lang"`
			Place                interface{} `json:"place"`
			PossiblySensitive    bool        `json:"possibly_sensitive"`
			RetweetCount         int         `json:"retweet_count"`
			Retweeted            bool        `json:"retweeted"`
			Source               string      `json:"source"`
			Text                 string      `json:"text"`
			Truncated            bool        `json:"truncated"`
		} `json:"retweeted_status"`
		Source    string `json:"source"`
		Text      string `json:"text"`
		Truncated bool   `json:"truncated"`
	} `json:"status"`
	StatusesCount int    `json:"statuses_count"`
	TimeZone      string `json:"time_zone"`
	URL           string `json:"url"`
	UtcOffset     int    `json:"utc_offset"`
	Verified      bool   `json:"verified"`
}

