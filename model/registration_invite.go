package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const RegistrationInviteCodeLength = 18

var (
	ErrRegistrationInviteRequired  = errors.New("registration invite code is required")
	ErrRegistrationInviteNotFound  = errors.New("registration invite code does not exist")
	ErrRegistrationInviteDisabled  = errors.New("registration invite code is disabled")
	ErrRegistrationInviteExpired   = errors.New("registration invite code has expired")
	ErrRegistrationInviteExhausted = errors.New("registration invite code usage limit reached")
)

type RegistrationInvite struct {
	Id        int            `json:"id"`
	Code      string         `json:"code" gorm:"type:varchar(64);uniqueIndex;not null"`
	Remark    string         `json:"remark" gorm:"type:varchar(255)"`
	Status    int            `json:"status" gorm:"type:int;default:1;index"`
	MaxUses   int            `json:"max_uses" gorm:"type:int;default:0"`
	UsedCount int            `json:"used_count" gorm:"type:int;default:0"`
	ExpiresAt int64          `json:"expires_at" gorm:"bigint;default:0;index"`
	CreatedBy int            `json:"created_by" gorm:"type:int;index"`
	CreatedAt int64          `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt int64          `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index"`
	Count     int            `json:"count" gorm:"-:all"`
}

type RegistrationInviteUsage struct {
	Id                   int    `json:"id"`
	RegistrationInviteId int    `json:"registration_invite_id" gorm:"type:int;index"`
	Code                 string `json:"code" gorm:"type:varchar(64);index"`
	UserId               int    `json:"user_id" gorm:"type:int;index"`
	RegistrationMethod   string `json:"registration_method" gorm:"type:varchar(32);index"`
	UsedAt               int64  `json:"used_at" gorm:"autoCreateTime;column:used_at"`
}

func NormalizeRegistrationInviteCode(code string) string {
	return strings.TrimSpace(code)
}

func GenerateRegistrationInviteCode() (string, error) {
	return GenerateRegistrationInviteCodeWithTx(DB)
}

func GenerateRegistrationInviteCodeWithTx(tx *gorm.DB) (string, error) {
	for i := 0; i < 8; i++ {
		code, err := common.GenerateRandomCharsKey(RegistrationInviteCodeLength)
		if err != nil {
			return "", err
		}
		var count int64
		if err := tx.Model(&RegistrationInvite{}).Where("code = ?", code).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return code, nil
		}
	}
	return "", errors.New("failed to generate unique registration invite code")
}

func IsValidRegistrationInviteCodeFormat(code string) bool {
	code = NormalizeRegistrationInviteCode(code)
	if len(code) < 4 || len(code) > 64 {
		return false
	}
	for _, r := range code {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return false
	}
	return true
}

func LockValidRegistrationInviteWithTx(tx *gorm.DB, code string) (*RegistrationInvite, error) {
	code = NormalizeRegistrationInviteCode(code)
	if code == "" {
		return nil, ErrRegistrationInviteRequired
	}

	query := tx.Where("code = ?", code)
	if !common.UsingSQLite {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}

	invite := &RegistrationInvite{}
	if err := query.First(invite).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRegistrationInviteNotFound
		}
		return nil, err
	}
	if invite.Status != common.RegistrationInviteStatusEnabled {
		return nil, ErrRegistrationInviteDisabled
	}
	if invite.ExpiresAt != 0 && invite.ExpiresAt < common.GetTimestamp() {
		return nil, ErrRegistrationInviteExpired
	}
	if invite.MaxUses > 0 && invite.UsedCount >= invite.MaxUses {
		return nil, ErrRegistrationInviteExhausted
	}
	return invite, nil
}

func UseRegistrationInviteWithTx(tx *gorm.DB, invite *RegistrationInvite, userId int, registrationMethod string) error {
	if invite == nil || invite.Id == 0 {
		return ErrRegistrationInviteNotFound
	}
	if userId == 0 {
		return errors.New("invalid user id")
	}
	if registrationMethod == "" {
		registrationMethod = "unknown"
	}

	now := common.GetTimestamp()
	query := tx.Model(&RegistrationInvite{}).
		Where("id = ?", invite.Id).
		Where("status = ?", common.RegistrationInviteStatusEnabled).
		Where("(expires_at = ? OR expires_at >= ?)", 0, now).
		Where("(max_uses = ? OR used_count < max_uses)", 0)

	result := query.Update("used_count", gorm.Expr("used_count + ?", 1))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrRegistrationInviteExhausted
	}

	usage := &RegistrationInviteUsage{
		RegistrationInviteId: invite.Id,
		Code:                 invite.Code,
		UserId:               userId,
		RegistrationMethod:   registrationMethod,
	}
	return tx.Create(usage).Error
}

func GetAllRegistrationInvites(startIdx int, num int) (invites []*RegistrationInvite, total int64, err error) {
	query := DB.Model(&RegistrationInvite{})
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&invites).Error
	return invites, total, err
}

func SearchRegistrationInvites(keyword string, startIdx int, num int) (invites []*RegistrationInvite, total int64, err error) {
	keyword = strings.TrimSpace(keyword)
	query := DB.Model(&RegistrationInvite{})
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("code LIKE ? OR remark LIKE ?", like, like)
	}
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&invites).Error
	return invites, total, err
}

func GetRegistrationInviteById(id int) (*RegistrationInvite, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	invite := RegistrationInvite{Id: id}
	err := DB.First(&invite, "id = ?", id).Error
	return &invite, err
}

func GetRegistrationInviteUsages(inviteId int, startIdx int, num int) (usages []*RegistrationInviteUsage, total int64, err error) {
	if inviteId == 0 {
		return nil, 0, errors.New("id 为空！")
	}
	query := DB.Model(&RegistrationInviteUsage{}).Where("registration_invite_id = ?", inviteId)
	if err = query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&usages).Error
	return usages, total, err
}

func CreateRegistrationInvites(template RegistrationInvite) ([]string, error) {
	template.Code = NormalizeRegistrationInviteCode(template.Code)
	if template.Status == 0 {
		template.Status = common.RegistrationInviteStatusEnabled
	}

	codes := make([]string, 0, template.Count)
	seenCodes := make(map[string]struct{}, template.Count)
	err := DB.Transaction(func(tx *gorm.DB) error {
		for i := 0; i < template.Count; i++ {
			code := template.Code
			if code == "" {
				generatedCode := ""
				for attempt := 0; attempt < 16; attempt++ {
					generated, err := GenerateRegistrationInviteCodeWithTx(tx)
					if err != nil {
						return err
					}
					if _, exists := seenCodes[generated]; exists {
						continue
					}
					generatedCode = generated
					break
				}
				if generatedCode == "" {
					return errors.New("failed to generate unique registration invite code")
				}
				code = generatedCode
			}

			cleanInvite := RegistrationInvite{
				Code:      code,
				Remark:    template.Remark,
				Status:    template.Status,
				MaxUses:   template.MaxUses,
				ExpiresAt: template.ExpiresAt,
				CreatedBy: template.CreatedBy,
			}
			if err := tx.Create(&cleanInvite).Error; err != nil {
				return err
			}
			codes = append(codes, code)
			seenCodes[code] = struct{}{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return codes, nil
}

func (invite *RegistrationInvite) Insert() error {
	invite.Code = NormalizeRegistrationInviteCode(invite.Code)
	if invite.Status == 0 {
		invite.Status = common.RegistrationInviteStatusEnabled
	}
	return DB.Create(invite).Error
}

func (invite *RegistrationInvite) Update() error {
	return DB.Model(invite).Select("remark", "status", "max_uses", "expires_at").Updates(invite).Error
}

func (invite *RegistrationInvite) Delete() error {
	return DB.Delete(invite).Error
}

func DeleteRegistrationInviteById(id int) error {
	if id == 0 {
		return errors.New("id 为空！")
	}
	invite := RegistrationInvite{Id: id}
	if err := DB.Where(invite).First(&invite).Error; err != nil {
		return err
	}
	return invite.Delete()
}

func DeleteInvalidRegistrationInvites() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where(
		"status = ? OR (expires_at != 0 AND expires_at < ?) OR (max_uses > 0 AND used_count >= max_uses)",
		common.RegistrationInviteStatusDisabled,
		now,
	).Delete(&RegistrationInvite{})
	return result.RowsAffected, result.Error
}

func CreateUserWithRegistrationInvite(user *User, inviterId int, inviteCode string, registrationMethod string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		invite, err := LockValidRegistrationInviteWithTx(tx, inviteCode)
		if err != nil {
			return err
		}
		if err := user.InsertWithTx(tx, inviterId); err != nil {
			return err
		}
		return UseRegistrationInviteWithTx(tx, invite, user.Id, registrationMethod)
	})
}

func RegistrationInviteStatusLabel(status int) string {
	switch status {
	case common.RegistrationInviteStatusEnabled:
		return "enabled"
	case common.RegistrationInviteStatusDisabled:
		return "disabled"
	default:
		return fmt.Sprintf("unknown:%d", status)
	}
}
