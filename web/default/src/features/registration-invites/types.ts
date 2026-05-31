/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

export interface RegistrationInvite {
  id: number
  code: string
  remark: string
  status: number
  max_uses: number
  used_count: number
  expires_at: number
  created_by: number
  created_at: number
  updated_at: number
}

export interface RegistrationInviteUsage {
  id: number
  registration_invite_id: number
  code: string
  user_id: number
  registration_method: string
  used_at: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface PageData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ListRegistrationInvitesParams {
  p?: number
  page_size?: number
}

export interface SearchRegistrationInvitesParams extends ListRegistrationInvitesParams {
  keyword?: string
}

export interface RegistrationInviteFormData {
  id?: number
  code?: string
  remark: string
  status?: number
  max_uses: number
  expires_at: number
  count?: number
}
