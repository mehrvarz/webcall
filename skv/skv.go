// Copyright 2016 RapidLoop. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package skv provides a simple persistent key-value store for Go values. It
// can store a mapping of string to any gob-encodable Go value. It is
// lightweight and performant, and ideal for use in low-traffic websites,
// utilities and the like.
//
// The API is very simple - you can Put(), Get() or Delete() entries. These
// methods are goroutine-safe.
//
// skv uses BoltDB for storage and the encoding/gob package for encoding and
// decoding values. There are no other dependencies.
package skv

import (
	"bytes"
	"encoding/gob"
	"time"
	"sync"
	"github.com/mehrvarz/webcall/rkv"
	bolt "go.etcd.io/bbolt"
)

type SKV struct { // implements interface rkv.KV
	KvStore rkv.KVStore // Db + Dbr
}

var (
	DbMutex sync.Mutex
	MyOutBoundIpAddr string
)

// Open a key-value store. "path" is the full path to the database file, any
// leading directories must have been created already. File is created with
// mode 0640 if needed.
//
// Because of BoltDB restrictions, only one process may open the file at a
// time. Attempts to open the file from another process will fail with a
// timeout error.
func DbOpen(path string, dbPath string) (rkv.KV, error) {
	if MyOutBoundIpAddr == "" {
		MyOutBoundIpAddr,_ = rkv.GetOutboundIP()
	}

	DbMutex.Lock()
	defer DbMutex.Unlock()
	opts := &bolt.Options{
		Timeout: 50 * time.Millisecond,
	}
	db, err := bolt.Open(dbPath+path, 0640, opts)
	if err != nil {
		return nil, err
	}
	err = db.Update(func(tx *bolt.Tx) error {
		return nil
	})
	if err != nil {
		return nil, err
	}
	return SKV{KvStore:rkv.KVStore{Db: db}}, nil
}

func (kvs SKV) CreateBucket(bucketName string) error {
	err := kvs.KvStore.Db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists([]byte(bucketName))
		return err
	})
	return err
}

// Put an entry into the store. The passed value is gob-encoded and stored.
// The key can be an empty string, but the value cannot be nil - if it is,
// Put() returns ErrBadValue.
//
//	err := store.Put("key42", 156)
//	err := store.Put("key42", "this is a string")
//	m := map[string]int{
//	    "harry": 100,
//	    "emma":  101,
//	}
//	err := store.Put("key43", m)
func (kvs SKV) Put(bucketName string, key string, value interface{}, waitConfirm bool) error {
	if value == nil {
		return rkv.ErrBadValue
	}
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(value); err != nil {
		return err
	}
	return kvs.KvStore.Db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket([]byte(bucketName)).Put([]byte(key), buf.Bytes())
	})
}

// Get an entry from the store. "value" must be a pointer-typed. If the key
// is not present in the store, Get returns ErrNotFound.
//
//	type MyStruct struct {
//	    Numbers []int
//	}
//	var val MyStruct
//	if err := store.Get("key42", &val); err == skv.ErrNotFound {
//	    // "key42" not found
//	} else if err != nil {
//	    // an error occurred
//	} else {
//	    // ok
//	}
//
// The value passed to Get() can be nil, in which case any value read from
// the store is silently discarded.
//
//  if err := store.Get("key42", nil); err == nil {
//      fmt.Println("entry is present")
//  }
func (kvs SKV) Get(bucketName string, key string, value interface{}) error {
	return kvs.KvStore.Db.View(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte(bucketName)).Cursor()
		if k, v := c.Seek([]byte(key)); k == nil || string(k) != key {
			return rkv.ErrNotFound
		} else if value == nil {
			return nil
		} else {
			d := gob.NewDecoder(bytes.NewReader(v))
			return d.Decode(value)
		}
	})
}

// Delete the entry with the given key. If no such key is present in the store,
// it returns ErrNotFound.
func (kvs SKV) Delete(bucketName string, key string) error {
	return kvs.KvStore.Db.Update(func(tx *bolt.Tx) error {
		c := tx.Bucket([]byte(bucketName)).Cursor()
		if k, _ := c.Seek([]byte(key)); k == nil || string(k) != key {
			return rkv.ErrNotFound
		} else {
			return c.Delete()
		}
	})
}

// Close closes the key-value store file.
func (kvs SKV) Close() error {
	return kvs.KvStore.Db.Close()
}

// tm: added functionality
func (kvs SKV) SearchIp(bucketName string, ip string, value *byte) error {
	*value = 0
	err := kvs.KvStore.Db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketName))
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			d := gob.NewDecoder(bytes.NewReader(v))
			var dbEntry rkv.DbEntry
			d.Decode(&dbEntry)
			if dbEntry.Ip==ip {
				*value = 1
				return nil
			}
		}
		return nil // not found: *value = 0
	})
	return err
}

/*
func (kvs SKV) Dumpuser(bucketName string) error {
	err := kvs.KvStore.Db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketName))
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var dbUser rkv.DbUser
			d := gob.NewDecoder(bytes.NewReader(v))
			d.Decode(&dbUser)

			fmt.Printf("user %20s %d calls=%d p2p=%d/%d talk=%d(%d) %s,%s,%s %d,%d,%d\n",
				k,
				dbUser.PremiumLevel,
				dbUser.CallCounter, //dbUser.PermittedCalls,
				dbUser.LocalP2pCounter, dbUser.RemoteP2pCounter,
				dbUser.ConnectedToPeerSecs, dbUser.PermittedConnectedToPeerSecs,
				dbUser.Ip1, dbUser.Ip2, dbUser.Ip3,
				dbUser.Int1, dbUser.Int2, dbUser.Int3)
		}
		return nil
	})
	return err
}
*/

