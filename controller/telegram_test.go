package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/url"
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
)

func buildTelegramAuthorizationParamsForTest(token string, values url.Values) url.Values {
	strs := make([]string, 0, len(values))
	for k, v := range values {
		if k == "hash" {
			continue
		}
		strs = append(strs, k+"="+v[0])
	}
	sort.Strings(strs)

	imploded := ""
	for _, s := range strs {
		if imploded != "" {
			imploded += "\n"
		}
		imploded += s
	}

	sha256hash := sha256.New()
	io.WriteString(sha256hash, token)
	hmachash := hmac.New(sha256.New, sha256hash.Sum(nil))
	io.WriteString(hmachash, imploded)

	withHash := url.Values{}
	for k, v := range values {
		withHash[k] = append([]string(nil), v...)
	}
	withHash.Set("hash", hex.EncodeToString(hmachash.Sum(nil)))
	return withHash
}

func TestTelegramAuthorizationIgnoresRegistrationInviteCode(t *testing.T) {
	const token = "telegram-token"

	params := buildTelegramAuthorizationParamsForTest(token, url.Values{
		"id":         {"12345"},
		"first_name": {"Invite"},
		"auth_date":  {"1780050000"},
	})

	params.Set("invite_code", "INVITE-CODE")

	assert.True(t, checkTelegramAuthorization(params, token))
}
