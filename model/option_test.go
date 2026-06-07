package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionMapAppliesRegistrationInviteRequired(t *testing.T) {
	previousRequired := common.RegistrationInviteRequired
	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()

	t.Cleanup(func() {
		common.RegistrationInviteRequired = previousRequired
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	common.RegistrationInviteRequired = false
	require.NoError(t, updateOptionMap("RegistrationInviteRequired", "true"))
	assert.True(t, common.RegistrationInviteRequired)

	common.OptionMapRWMutex.RLock()
	assert.Equal(t, "true", common.OptionMap["RegistrationInviteRequired"])
	common.OptionMapRWMutex.RUnlock()

	require.NoError(t, updateOptionMap("RegistrationInviteRequired", "false"))
	assert.False(t, common.RegistrationInviteRequired)
}
