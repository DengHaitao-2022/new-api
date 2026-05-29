package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func createRegistrationInviteForTest(t *testing.T, invite RegistrationInvite) RegistrationInvite {
	t.Helper()
	if invite.Code == "" {
		invite.Code = "INVITE_TEST_CODE"
	}
	if invite.Status == 0 {
		invite.Status = common.RegistrationInviteStatusEnabled
	}
	require.NoError(t, DB.Create(&invite).Error)
	return invite
}

func lockRegistrationInviteForTest(code string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		_, err := LockValidRegistrationInviteWithTx(tx, code)
		return err
	})
}

func TestRegistrationInviteValidationErrors(t *testing.T) {
	truncateTables(t)

	assert.ErrorIs(t, lockRegistrationInviteForTest(""), ErrRegistrationInviteRequired)
	assert.ErrorIs(t, lockRegistrationInviteForTest("missing"), ErrRegistrationInviteNotFound)

	disabled := createRegistrationInviteForTest(t, RegistrationInvite{
		Code:   "INVITE_DISABLED",
		Status: common.RegistrationInviteStatusDisabled,
	})
	assert.ErrorIs(t, lockRegistrationInviteForTest(disabled.Code), ErrRegistrationInviteDisabled)

	expired := createRegistrationInviteForTest(t, RegistrationInvite{
		Code:      "INVITE_EXPIRED",
		ExpiresAt: common.GetTimestamp() - 1,
	})
	assert.ErrorIs(t, lockRegistrationInviteForTest(expired.Code), ErrRegistrationInviteExpired)

	exhausted := createRegistrationInviteForTest(t, RegistrationInvite{
		Code:      "INVITE_EXHAUSTED",
		MaxUses:   1,
		UsedCount: 1,
	})
	assert.ErrorIs(t, lockRegistrationInviteForTest(exhausted.Code), ErrRegistrationInviteExhausted)
}

func TestUseRegistrationInviteWithTxRecordsUsage(t *testing.T) {
	truncateTables(t)

	invite := createRegistrationInviteForTest(t, RegistrationInvite{
		Code:    "INVITE_SINGLE",
		MaxUses: 1,
	})

	err := DB.Transaction(func(tx *gorm.DB) error {
		locked, err := LockValidRegistrationInviteWithTx(tx, invite.Code)
		if err != nil {
			return err
		}
		return UseRegistrationInviteWithTx(tx, locked, 42, "password")
	})
	require.NoError(t, err)

	var reloaded RegistrationInvite
	require.NoError(t, DB.First(&reloaded, invite.Id).Error)
	assert.Equal(t, 1, reloaded.UsedCount)

	var usage RegistrationInviteUsage
	require.NoError(t, DB.Where("registration_invite_id = ?", invite.Id).First(&usage).Error)
	assert.Equal(t, invite.Code, usage.Code)
	assert.Equal(t, 42, usage.UserId)
	assert.Equal(t, "password", usage.RegistrationMethod)

	assert.ErrorIs(t, lockRegistrationInviteForTest(invite.Code), ErrRegistrationInviteExhausted)
}

func TestRegistrationInviteZeroMaxUsesIsUnlimited(t *testing.T) {
	truncateTables(t)

	invite := createRegistrationInviteForTest(t, RegistrationInvite{
		Code:      "INVITE_UNLIMITED",
		MaxUses:   0,
		UsedCount: 100,
	})

	err := DB.Transaction(func(tx *gorm.DB) error {
		locked, err := LockValidRegistrationInviteWithTx(tx, invite.Code)
		if err != nil {
			return err
		}
		return UseRegistrationInviteWithTx(tx, locked, 43, "oauth")
	})
	require.NoError(t, err)

	var reloaded RegistrationInvite
	require.NoError(t, DB.First(&reloaded, invite.Id).Error)
	assert.Equal(t, 101, reloaded.UsedCount)
}

func TestCreateUserWithRegistrationInviteCreatesUserAndConsumesInvite(t *testing.T) {
	truncateTables(t)

	invite := createRegistrationInviteForTest(t, RegistrationInvite{
		Code:    "INVITE_CREATE_USER",
		MaxUses: 1,
	})

	user := &User{
		Username:    "invite_user",
		Password:    "password123",
		DisplayName: "invite_user",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}

	require.NoError(t, CreateUserWithRegistrationInvite(user, 0, invite.Code, "password"))
	require.NotZero(t, user.Id)

	var reloaded User
	require.NoError(t, DB.First(&reloaded, user.Id).Error)
	assert.Equal(t, "invite_user", reloaded.Username)

	var reloadedInvite RegistrationInvite
	require.NoError(t, DB.First(&reloadedInvite, invite.Id).Error)
	assert.Equal(t, 1, reloadedInvite.UsedCount)

	var usage RegistrationInviteUsage
	require.NoError(t, DB.Where("registration_invite_id = ?", invite.Id).First(&usage).Error)
	assert.Equal(t, user.Id, usage.UserId)
	assert.Equal(t, "password", usage.RegistrationMethod)
}
