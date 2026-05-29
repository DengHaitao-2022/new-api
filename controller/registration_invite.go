package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func handleRegistrationInviteError(c *gin.Context, err error) bool {
	switch {
	case errors.Is(err, model.ErrRegistrationInviteRequired):
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteRequired)
	case errors.Is(err, model.ErrRegistrationInviteNotFound):
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteNotFound)
	case errors.Is(err, model.ErrRegistrationInviteDisabled):
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteDisabled)
	case errors.Is(err, model.ErrRegistrationInviteExpired):
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteExpired)
	case errors.Is(err, model.ErrRegistrationInviteExhausted):
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteExhausted)
	default:
		return false
	}
	return true
}

func validateRegistrationInvitePayload(c *gin.Context, invite *model.RegistrationInvite, isCreate bool) bool {
	invite.Code = model.NormalizeRegistrationInviteCode(invite.Code)
	invite.Remark = strings.TrimSpace(invite.Remark)
	if invite.Code != "" && !model.IsValidRegistrationInviteCodeFormat(invite.Code) {
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteCodeInvalid)
		return false
	}
	if utf8.RuneCountInString(invite.Remark) > 255 {
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteRemarkTooLong)
		return false
	}
	if invite.MaxUses < 0 {
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteMaxUsesInvalid)
		return false
	}
	if invite.ExpiresAt != 0 && invite.ExpiresAt < common.GetTimestamp() {
		common.ApiErrorI18n(c, i18n.MsgRegistrationInviteExpireTimeInvalid)
		return false
	}
	if invite.Status != 0 &&
		invite.Status != common.RegistrationInviteStatusEnabled &&
		invite.Status != common.RegistrationInviteStatusDisabled {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return false
	}
	if isCreate {
		if invite.Count == 0 {
			invite.Count = 1
		}
		if invite.Count <= 0 {
			common.ApiErrorI18n(c, i18n.MsgRegistrationInviteCountPositive)
			return false
		}
		if invite.Count > 100 {
			common.ApiErrorI18n(c, i18n.MsgRegistrationInviteCountMax)
			return false
		}
		if invite.Code != "" && invite.Count > 1 {
			common.ApiErrorI18n(c, i18n.MsgRegistrationInviteBatchWithCustomCode)
			return false
		}
	}
	return true
}

func GetAllRegistrationInvites(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	invites, total, err := model.GetAllRegistrationInvites(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(invites)
	common.ApiSuccess(c, pageInfo)
}

func SearchRegistrationInvites(c *gin.Context) {
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)
	invites, total, err := model.SearchRegistrationInvites(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(invites)
	common.ApiSuccess(c, pageInfo)
}

func GetRegistrationInvite(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidId)
		return
	}
	invite, err := model.GetRegistrationInviteById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    invite,
	})
}

func GetRegistrationInviteUsages(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidId)
		return
	}
	pageInfo := common.GetPageQuery(c)
	usages, total, err := model.GetRegistrationInviteUsages(id, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(usages)
	common.ApiSuccess(c, pageInfo)
}

func AddRegistrationInvite(c *gin.Context) {
	invite := model.RegistrationInvite{}
	if err := common.DecodeJson(c.Request.Body, &invite); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if !validateRegistrationInvitePayload(c, &invite, true) {
		return
	}

	codes := make([]string, 0, invite.Count)
	for i := 0; i < invite.Count; i++ {
		code := invite.Code
		if code == "" {
			generated, err := model.GenerateRegistrationInviteCode()
			if err != nil {
				common.ApiError(c, err)
				return
			}
			code = generated
		}
		cleanInvite := model.RegistrationInvite{
			Code:      code,
			Remark:    invite.Remark,
			Status:    common.RegistrationInviteStatusEnabled,
			MaxUses:   invite.MaxUses,
			ExpiresAt: invite.ExpiresAt,
			CreatedBy: c.GetInt("id"),
		}
		if invite.Status != 0 {
			cleanInvite.Status = invite.Status
		}
		if err := cleanInvite.Insert(); err != nil {
			common.ApiError(c, err)
			return
		}
		codes = append(codes, code)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    codes,
	})
}

func UpdateRegistrationInvite(c *gin.Context) {
	statusOnly := c.Query("status_only")
	invite := model.RegistrationInvite{}
	if err := common.DecodeJson(c.Request.Body, &invite); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	cleanInvite, err := model.GetRegistrationInviteById(invite.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	if statusOnly == "" {
		if !validateRegistrationInvitePayload(c, &invite, false) {
			return
		}
		cleanInvite.Remark = invite.Remark
		cleanInvite.MaxUses = invite.MaxUses
		cleanInvite.ExpiresAt = invite.ExpiresAt
	}
	if statusOnly != "" {
		if invite.Status != common.RegistrationInviteStatusEnabled && invite.Status != common.RegistrationInviteStatusDisabled {
			common.ApiErrorI18n(c, i18n.MsgInvalidParams)
			return
		}
		cleanInvite.Status = invite.Status
	}
	if err := cleanInvite.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    cleanInvite,
	})
}

func DeleteRegistrationInvite(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidId)
		return
	}
	if err := model.DeleteRegistrationInviteById(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func DeleteInvalidRegistrationInvites(c *gin.Context) {
	rows, err := model.DeleteInvalidRegistrationInvites()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
}
