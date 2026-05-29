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
import { api } from '@/lib/api'
import type {
  ApiResponse,
  ListRegistrationInvitesParams,
  PageData,
  RegistrationInvite,
  RegistrationInviteFormData,
  RegistrationInviteUsage,
  SearchRegistrationInvitesParams,
} from './types'

export async function getRegistrationInvites(
  params: ListRegistrationInvitesParams = {}
): Promise<ApiResponse<PageData<RegistrationInvite>>> {
  const res = await api.get('/api/registration_invite/', { params })
  return res.data
}

export async function searchRegistrationInvites(
  params: SearchRegistrationInvitesParams
): Promise<ApiResponse<PageData<RegistrationInvite>>> {
  const res = await api.get('/api/registration_invite/search', { params })
  return res.data
}

export async function getRegistrationInvite(
  id: number
): Promise<ApiResponse<RegistrationInvite>> {
  const res = await api.get(`/api/registration_invite/${id}`)
  return res.data
}

export async function createRegistrationInvite(
  data: RegistrationInviteFormData
): Promise<ApiResponse<string[]>> {
  const res = await api.post('/api/registration_invite/', data)
  return res.data
}

export async function updateRegistrationInvite(
  data: RegistrationInviteFormData & { id: number }
): Promise<ApiResponse<RegistrationInvite>> {
  const res = await api.put('/api/registration_invite/', data)
  return res.data
}

export async function updateRegistrationInviteStatus(
  id: number,
  status: number
): Promise<ApiResponse<RegistrationInvite>> {
  const res = await api.put('/api/registration_invite/?status_only=true', {
    id,
    status,
  })
  return res.data
}

export async function deleteRegistrationInvite(
  id: number
): Promise<ApiResponse> {
  const res = await api.delete(`/api/registration_invite/${id}`)
  return res.data
}

export async function deleteInvalidRegistrationInvites(): Promise<
  ApiResponse<number>
> {
  const res = await api.delete('/api/registration_invite/invalid')
  return res.data
}

export async function getRegistrationInviteUsages(
  id: number,
  params: ListRegistrationInvitesParams = {}
): Promise<ApiResponse<PageData<RegistrationInviteUsage>>> {
  const res = await api.get(`/api/registration_invite/${id}/usages`, {
    params,
  })
  return res.data
}
