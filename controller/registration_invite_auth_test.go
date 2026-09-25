package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type registrationInviteOAuthProvider struct {
	existingUser *model.User
}

func (*registrationInviteOAuthProvider) GetName() string              { return "Invite OAuth" }
func (*registrationInviteOAuthProvider) ProviderUserIDColumn() string { return "oidc_id" }
func (*registrationInviteOAuthProvider) IsEnabled() bool              { return true }
func (*registrationInviteOAuthProvider) ExchangeToken(context.Context, string, *gin.Context) (*oauth.OAuthToken, error) {
	return &oauth.OAuthToken{}, nil
}
func (*registrationInviteOAuthProvider) GetUserInfo(context.Context, *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return &oauth.OAuthUser{ProviderUserID: "invite-oauth-user"}, nil
}
func (provider *registrationInviteOAuthProvider) IsUserIDTaken(string) bool {
	return provider.existingUser != nil
}
func (provider *registrationInviteOAuthProvider) FillUserByProviderID(user *model.User, _ string) error {
	*user = *provider.existingUser
	return nil
}
func (*registrationInviteOAuthProvider) SetProviderUserID(user *model.User, providerUserID string) {
	user.OidcId = providerUserID
}
func (*registrationInviteOAuthProvider) GetProviderPrefix() string { return "invite_oauth_" }

func setupRegistrationInviteAuthTest(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousDatabaseType := common.MainDatabaseType()
	previousRedisEnabled := common.RedisEnabled
	previousRegisterEnabled := common.RegisterEnabled
	previousPasswordRegisterEnabled := common.PasswordRegisterEnabled
	previousEmailVerificationEnabled := common.EmailVerificationEnabled
	previousInviteRequired := common.RegistrationInviteRequired
	previousGenerateDefaultToken := constant.GenerateDefaultToken

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Info)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.UserSession{},
		&model.AuthFlow{},
		&model.ExternalIdentityClaim{},
		&model.UserOAuthBinding{},
		&model.RegistrationInvite{},
		&model.RegistrationInviteUsage{},
		&model.Token{},
		&model.Log{},
	))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.EmailVerificationEnabled = false
	common.RegistrationInviteRequired = false
	constant.GenerateDefaultToken = false

	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.RedisEnabled = previousRedisEnabled
		common.RegisterEnabled = previousRegisterEnabled
		common.PasswordRegisterEnabled = previousPasswordRegisterEnabled
		common.EmailVerificationEnabled = previousEmailVerificationEnabled
		common.RegistrationInviteRequired = previousInviteRequired
		constant.GenerateDefaultToken = previousGenerateDefaultToken
	})
	return db
}

func registrationRequest(t *testing.T, body string) (bool, *httptest.ResponseRecorder) {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	Register(c)

	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response.Success, recorder
}

func TestPasswordRegistrationInviteRequirementAndSingleUse(t *testing.T) {
	db := setupRegistrationInviteAuthTest(t)

	success, _ := registrationRequest(t, `{"username":"open-user","password":"password123"}`)
	assert.True(t, success)

	common.RegistrationInviteRequired = true
	success, _ = registrationRequest(t, `{"username":"missing-invite","password":"password123"}`)
	assert.False(t, success)

	invite := model.RegistrationInvite{
		Code:    "PASSWORD-INVITE",
		Status:  common.RegistrationInviteStatusEnabled,
		MaxUses: 1,
	}
	require.NoError(t, db.Create(&invite).Error)
	success, _ = registrationRequest(t, `{"username":"invited-user","password":"password123","invite_code":"PASSWORD-INVITE"}`)
	assert.True(t, success)
	success, _ = registrationRequest(t, `{"username":"second-user","password":"password123","invite_code":"PASSWORD-INVITE"}`)
	assert.False(t, success)

	var usage model.RegistrationInviteUsage
	require.NoError(t, db.Where("registration_invite_id = ?", invite.Id).First(&usage).Error)
	assert.Equal(t, "password", usage.RegistrationMethod)
}

func TestOAuthRegistrationConsumesInviteAndExistingLoginBypassesRequirement(t *testing.T) {
	db := setupRegistrationInviteAuthTest(t)
	common.RegistrationInviteRequired = true
	invite := model.RegistrationInvite{
		Code:    "OAUTH-INVITE",
		Status:  common.RegistrationInviteStatusEnabled,
		MaxUses: 1,
	}
	require.NoError(t, db.Create(&invite).Error)

	provider := &registrationInviteOAuthProvider{}
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	created, _, err := findOrCreateOAuthUser(c, provider, &oauth.OAuthUser{
		ProviderUserID: "new-oauth-user",
		Username:       "new-oauth-user",
	}, nil, "", invite.Code)
	require.NoError(t, err)
	require.NotZero(t, created.Id)

	var usage model.RegistrationInviteUsage
	require.NoError(t, db.Where("registration_invite_id = ?", invite.Id).First(&usage).Error)
	assert.Equal(t, "invite_oauth", usage.RegistrationMethod)

	provider.existingUser = created
	existing, _, err := findOrCreateOAuthUser(c, provider, &oauth.OAuthUser{
		ProviderUserID: "new-oauth-user",
	}, nil, "", "")
	require.NoError(t, err)
	assert.Equal(t, created.Id, existing.Id)

	var usageCount int64
	require.NoError(t, db.Model(&model.RegistrationInviteUsage{}).Count(&usageCount).Error)
	assert.Equal(t, int64(1), usageCount)
}

func TestOAuthRegistrationRejectsInvalidInvitesWithoutCreatingUser(t *testing.T) {
	for _, tc := range []struct {
		name   string
		invite model.RegistrationInvite
		code   string
		want   error
	}{
		{name: "missing", want: model.ErrRegistrationInviteRequired},
		{name: "unknown", code: "UNKNOWN", want: model.ErrRegistrationInviteNotFound},
		{name: "expired", invite: model.RegistrationInvite{Code: "EXPIRED", Status: common.RegistrationInviteStatusEnabled, ExpiresAt: common.GetTimestamp() - 1}, code: "EXPIRED", want: model.ErrRegistrationInviteExpired},
		{name: "exhausted", invite: model.RegistrationInvite{Code: "USED", Status: common.RegistrationInviteStatusEnabled, MaxUses: 1, UsedCount: 1}, code: "USED", want: model.ErrRegistrationInviteExhausted},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := setupRegistrationInviteAuthTest(t)
			common.RegistrationInviteRequired = true
			if tc.invite.Code != "" {
				require.NoError(t, db.Create(&tc.invite).Error)
			}
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			user, migration, err := findOrCreateOAuthUser(c, &registrationInviteOAuthProvider{}, &oauth.OAuthUser{ProviderUserID: "rejected-user", Username: "rejected-user"}, nil, "", tc.code)
			require.ErrorIs(t, err, tc.want)
			assert.Nil(t, user)
			assert.Nil(t, migration)
			var count int64
			require.NoError(t, db.Model(&model.User{}).Count(&count).Error)
			assert.Zero(t, count)
			require.NoError(t, db.Model(&model.RegistrationInviteUsage{}).Count(&count).Error)
			assert.Zero(t, count)
		})
	}
}
