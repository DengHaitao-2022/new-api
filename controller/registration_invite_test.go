package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestValidateRegistrationInvitePayloadDefaultsCreateCount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	invite := model.RegistrationInvite{
		Code: "INVITE_DEFAULT_COUNT",
	}

	assert.True(t, validateRegistrationInvitePayload(c, &invite, true))
	assert.Equal(t, 1, invite.Count)
}
