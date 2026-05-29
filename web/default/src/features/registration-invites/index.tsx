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
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import {
  Edit,
  Eye,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestampToDate } from '@/lib/format'
import { addTimeToDate } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { SectionPageLayout } from '@/components/layout'
import { MaskedValueDisplay } from '@/components/masked-value-display'
import { StatusBadge } from '@/components/status-badge'
import {
  createRegistrationInvite,
  deleteInvalidRegistrationInvites,
  deleteRegistrationInvite,
  getRegistrationInvite,
  getRegistrationInvites,
  getRegistrationInviteUsages,
  searchRegistrationInvites,
  updateRegistrationInvite,
  updateRegistrationInviteStatus,
} from './api'
import type {
  RegistrationInvite,
  RegistrationInviteFormData,
  RegistrationInviteUsage,
} from './types'

const REGISTRATION_INVITE_STATUS = {
  ENABLED: 1,
  DISABLED: 2,
} as const

const PAGE_SIZE_OPTIONS = [10, 20, 50]

type InviteFormValues = {
  code: string
  remark: string
  max_uses: number
  expires_at?: Date
  count: number
}

function getInviteFormSchema(t: TFunction) {
  return z.object({
    code: z
      .string()
      .trim()
      .max(64, t('Invitation code must be at most 64 characters'))
      .refine(
        (value) => value === '' || value.length >= 4,
        t('Invitation code must be at least 4 characters')
      )
      .refine(
        (value) => value === '' || /^[A-Za-z0-9_-]+$/.test(value),
        t(
          'Invitation code can only contain letters, numbers, hyphens, and underscores'
        )
      ),
    remark: z
      .string()
      .trim()
      .max(255, t('Remark must be at most 255 characters')),
    max_uses: z.number().int().min(0, t('Maximum uses cannot be negative')),
    expires_at: z.date().optional(),
    count: z
      .number()
      .int()
      .min(1, t('Quantity must be between 1 and 100'))
      .max(100, t('Quantity must be between 1 and 100')),
  })
}

function isInviteExpired(invite: RegistrationInvite): boolean {
  return invite.expires_at > 0 && invite.expires_at < Date.now() / 1000
}

function isInviteExhausted(invite: RegistrationInvite): boolean {
  return invite.max_uses > 0 && invite.used_count >= invite.max_uses
}

function getInviteFormDefaults(invite?: RegistrationInvite): InviteFormValues {
  return {
    code: invite?.code ?? '',
    remark: invite?.remark ?? '',
    max_uses: invite?.max_uses ?? 1,
    expires_at:
      invite && invite.expires_at > 0
        ? new Date(invite.expires_at * 1000)
        : undefined,
    count: 1,
  }
}

function toInvitePayload(data: InviteFormValues): RegistrationInviteFormData {
  return {
    code: data.code.trim(),
    remark: data.remark.trim(),
    max_uses: data.max_uses,
    expires_at: data.expires_at
      ? Math.floor(data.expires_at.getTime() / 1000)
      : 0,
    count: data.count,
  }
}

function InviteStatusBadge({ invite }: { invite: RegistrationInvite }) {
  const { t } = useTranslation()

  if (invite.status === REGISTRATION_INVITE_STATUS.DISABLED) {
    return (
      <StatusBadge label={t('Disabled')} variant='neutral' copyable={false} />
    )
  }
  if (isInviteExpired(invite)) {
    return (
      <StatusBadge label={t('Expired')} variant='warning' copyable={false} />
    )
  }
  if (isInviteExhausted(invite)) {
    return (
      <StatusBadge label={t('Exhausted')} variant='warning' copyable={false} />
    )
  }
  return <StatusBadge label={t('Enabled')} variant='success' copyable={false} />
}

function IconAction(props: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className={cn(
              'size-8',
              props.destructive && 'text-destructive hover:text-destructive'
            )}
            onClick={props.onClick}
            disabled={props.disabled}
            aria-label={props.label}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

export function RegistrationInvites() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [selectedInvites, setSelectedInvites] = useState<
    Record<number, RegistrationInvite>
  >({})
  const [editingInvite, setEditingInvite] = useState<RegistrationInvite | null>(
    null
  )
  const [deletingInvite, setDeletingInvite] =
    useState<RegistrationInvite | null>(null)
  const [usageInvite, setUsageInvite] = useState<RegistrationInvite | null>(
    null
  )
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [showDeleteInvalidConfirm, setShowDeleteInvalidConfirm] =
    useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['registration-invites', page, pageSize, keyword, refreshTrigger],
    queryFn: async () => {
      const params = { p: page, page_size: pageSize }
      const result = keyword
        ? await searchRegistrationInvites({ ...params, keyword })
        : await getRegistrationInvites(params)
      return {
        items: result.data?.items ?? [],
        total: result.data?.total ?? 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const invites = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const selectedCount = Object.keys(selectedInvites).length
  const allPageSelected =
    invites.length > 0 && invites.every((invite) => selectedInvites[invite.id])
  const selectedCodes = useMemo(
    () =>
      Object.values(selectedInvites)
        .map((invite) => `${invite.code}\t${invite.remark || '-'}`)
        .join('\n'),
    [selectedInvites]
  )

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount)
    }
  }, [page, pageCount])

  const refresh = () => {
    setRefreshTrigger((value) => value + 1)
  }

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setKeyword(searchInput.trim())
    setPage(1)
  }

  const toggleInviteSelection = (
    invite: RegistrationInvite,
    checked: boolean
  ) => {
    setSelectedInvites((current) => {
      const next = { ...current }
      if (checked) {
        next[invite.id] = invite
      } else {
        delete next[invite.id]
      }
      return next
    })
  }

  const togglePageSelection = (checked: boolean) => {
    setSelectedInvites((current) => {
      const next = { ...current }
      for (const invite of invites) {
        if (checked) {
          next[invite.id] = invite
        } else {
          delete next[invite.id]
        }
      }
      return next
    })
  }

  const handleToggleStatus = async (invite: RegistrationInvite) => {
    const isEnabled = invite.status === REGISTRATION_INVITE_STATUS.ENABLED
    const result = await updateRegistrationInviteStatus(
      invite.id,
      isEnabled
        ? REGISTRATION_INVITE_STATUS.DISABLED
        : REGISTRATION_INVITE_STATUS.ENABLED
    )
    if (result.success) {
      toast.success(
        isEnabled
          ? t('Registration invitation code disabled successfully')
          : t('Registration invitation code enabled successfully')
      )
      refresh()
    }
  }

  const handleDelete = async () => {
    if (!deletingInvite) return
    setIsDeleting(true)
    try {
      const result = await deleteRegistrationInvite(deletingInvite.id)
      if (result.success) {
        toast.success(t('Registration invitation code deleted successfully'))
        setDeletingInvite(null)
        setSelectedInvites((current) => {
          const next = { ...current }
          delete next[deletingInvite.id]
          return next
        })
        refresh()
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteInvalid = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteInvalidRegistrationInvites()
      if (result.success) {
        toast.success(
          t(
            'Successfully deleted {{count}} invalid registration invitation codes',
            {
              count: result.data ?? 0,
            }
          )
        )
        setSelectedInvites({})
        setShowDeleteInvalidConfirm(false)
        refresh()
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Registration Invitation Codes')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <CopyButton
            value={selectedCodes}
            variant='outline'
            size='sm'
            tooltip={t('Copy selected invitation codes')}
            successTooltip={t('Invitation codes copied!')}
            aria-label={t('Copy selected invitation codes')}
          >
            <span>{t('Copy Selected')}</span>
          </CopyButton>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setShowDeleteInvalidConfirm(true)}
          >
            <Trash2 className='h-4 w-4' />
            {t('Delete Invalid')}
          </Button>
          <Button size='sm' onClick={() => setIsCreateOpen(true)}>
            <Plus className='h-4 w-4' />
            {t('Create Code')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-3'>
            <form
              onSubmit={handleSearch}
              className='flex flex-col gap-2 sm:flex-row sm:items-center'
            >
              <div className='relative min-w-0 flex-1'>
                <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={t('Search invitation code or remark...')}
                  className='pl-9'
                />
              </div>
              <div className='flex gap-2'>
                <Button type='submit' variant='outline'>
                  {t('Search')}
                </Button>
                {keyword && (
                  <Button
                    type='button'
                    variant='ghost'
                    onClick={() => {
                      setSearchInput('')
                      setKeyword('')
                      setPage(1)
                    }}
                  >
                    {t('Reset')}
                  </Button>
                )}
              </div>
            </form>

            {selectedCount > 0 && (
              <div className='bg-muted/40 text-muted-foreground flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm'>
                <span>
                  {t('Selected invitation codes: {{count}}', {
                    count: selectedCount,
                  })}
                </span>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => setSelectedInvites({})}
                >
                  {t('Clear selection')}
                </Button>
              </div>
            )}

            <div className='overflow-hidden rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      <Checkbox
                        checked={allPageSelected}
                        indeterminate={!allPageSelected && selectedCount > 0}
                        onCheckedChange={(value) =>
                          togglePageSelection(Boolean(value))
                        }
                        aria-label={t('Select all')}
                      />
                    </TableHead>
                    <TableHead>{t('Code')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Used / Max')}</TableHead>
                    <TableHead className='hidden md:table-cell'>
                      {t('Expires')}
                    </TableHead>
                    <TableHead className='hidden lg:table-cell'>
                      {t('Remark')}
                    </TableHead>
                    <TableHead className='hidden lg:table-cell'>
                      {t('Created')}
                    </TableHead>
                    <TableHead className='w-[168px] text-right'>
                      {t('Actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className='h-24 text-center'>
                        <Loader2 className='mx-auto h-5 w-5 animate-spin' />
                      </TableCell>
                    </TableRow>
                  ) : invites.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className='text-muted-foreground h-24 text-center'
                      >
                        {t('No registration invitation codes found')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    invites.map((invite) => (
                      <TableRow
                        key={invite.id}
                        className={
                          invite.status ===
                            REGISTRATION_INVITE_STATUS.DISABLED ||
                          isInviteExpired(invite) ||
                          isInviteExhausted(invite)
                            ? 'bg-muted/30'
                            : undefined
                        }
                      >
                        <TableCell>
                          <Checkbox
                            checked={Boolean(selectedInvites[invite.id])}
                            onCheckedChange={(value) =>
                              toggleInviteSelection(invite, Boolean(value))
                            }
                            aria-label={t('Select row')}
                          />
                        </TableCell>
                        <TableCell>
                          <MaskedValueDisplay
                            label={t('Full Invitation Code')}
                            fullValue={invite.code}
                            maskedValue={
                              invite.code.length > 16
                                ? `${invite.code.slice(0, 6)}******${invite.code.slice(-4)}`
                                : invite.code
                            }
                            copyTooltip={t('Copy invitation code')}
                            copyAriaLabel={t('Copy invitation code')}
                          />
                        </TableCell>
                        <TableCell>
                          <InviteStatusBadge invite={invite} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={
                              invite.max_uses > 0
                                ? `${invite.used_count} / ${invite.max_uses}`
                                : `${invite.used_count} / ${t('Unlimited')}`
                            }
                            variant={
                              isInviteExhausted(invite) ? 'warning' : 'neutral'
                            }
                            copyable={false}
                          />
                        </TableCell>
                        <TableCell className='hidden md:table-cell'>
                          {invite.expires_at > 0 ? (
                            <span
                              className={cn(
                                'font-mono text-xs',
                                isInviteExpired(invite) && 'text-warning'
                              )}
                            >
                              {formatTimestampToDate(invite.expires_at)}
                            </span>
                          ) : (
                            <StatusBadge
                              label={t('Never')}
                              variant='neutral'
                              copyable={false}
                            />
                          )}
                        </TableCell>
                        <TableCell className='hidden max-w-[240px] truncate lg:table-cell'>
                          {invite.remark || (
                            <span className='text-muted-foreground'>-</span>
                          )}
                        </TableCell>
                        <TableCell className='hidden font-mono text-xs lg:table-cell'>
                          {formatTimestampToDate(invite.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className='flex justify-end gap-1'>
                            <IconAction
                              label={t('Usage Records')}
                              onClick={() => setUsageInvite(invite)}
                            >
                              <Eye className='h-4 w-4' />
                            </IconAction>
                            <IconAction
                              label={t('Edit')}
                              onClick={() => setEditingInvite(invite)}
                            >
                              <Edit className='h-4 w-4' />
                            </IconAction>
                            <IconAction
                              label={
                                invite.status ===
                                REGISTRATION_INVITE_STATUS.ENABLED
                                  ? t('Disable')
                                  : t('Enable')
                              }
                              onClick={() => handleToggleStatus(invite)}
                            >
                              {invite.status ===
                              REGISTRATION_INVITE_STATUS.ENABLED ? (
                                <PowerOff className='h-4 w-4' />
                              ) : (
                                <Power className='h-4 w-4' />
                              )}
                            </IconAction>
                            <IconAction
                              label={t('Delete')}
                              onClick={() => setDeletingInvite(invite)}
                              destructive
                            >
                              <Trash2 className='h-4 w-4' />
                            </IconAction>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <div className='text-muted-foreground text-sm'>
                {isFetching
                  ? t('Refreshing...')
                  : t('Invitation codes total: {{total}}', { total })}
              </div>
              <div className='flex items-center gap-2'>
                <Select
                  items={PAGE_SIZE_OPTIONS.map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value))
                    setPage(1)
                  }}
                >
                  <SelectTrigger className='w-24'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {PAGE_SIZE_OPTIONS.map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  {t('Previous')}
                </Button>
                <span className='text-sm'>
                  {page} / {pageCount}
                </span>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page >= pageCount}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                >
                  {t('Next')}
                </Button>
              </div>
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <RegistrationInviteDrawer
        open={isCreateOpen || Boolean(editingInvite)}
        invite={editingInvite ?? undefined}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false)
            setEditingInvite(null)
          }
        }}
        onSaved={refresh}
        onCreated={setGeneratedCodes}
      />
      <GeneratedCodesDialog
        codes={generatedCodes}
        onOpenChange={(open) => {
          if (!open) {
            setGeneratedCodes([])
          }
        }}
      />
      <UsageRecordsDialog
        invite={usageInvite}
        onOpenChange={(open) => !open && setUsageInvite(null)}
      />
      <ConfirmDialog
        destructive
        open={Boolean(deletingInvite)}
        onOpenChange={(open) => !open && setDeletingInvite(null)}
        title={t('Delete Registration Invitation Code?')}
        desc={
          <>
            {t('This will permanently delete invitation code')}{' '}
            <strong>{deletingInvite?.code}</strong>
            {t('. This action cannot be undone.')}
          </>
        }
        confirmText={isDeleting ? t('Deleting...') : t('Delete')}
        isLoading={isDeleting}
        handleConfirm={handleDelete}
      />
      <ConfirmDialog
        destructive
        open={showDeleteInvalidConfirm}
        onOpenChange={setShowDeleteInvalidConfirm}
        title={t('Delete Invalid Registration Invitation Codes?')}
        desc={
          <>
            {t(
              'This will delete all disabled, expired, and exhausted invitation codes.'
            )}
            <br />
            {t('This action cannot be undone.')}
          </>
        }
        confirmText={isDeleting ? t('Deleting...') : t('Delete Invalid')}
        isLoading={isDeleting}
        handleConfirm={handleDeleteInvalid}
      />
    </>
  )
}

function RegistrationInviteDrawer(props: {
  open: boolean
  invite?: RegistrationInvite
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onCreated: (codes: string[]) => void
}) {
  const { t } = useTranslation()
  const isUpdate = Boolean(props.invite)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(getInviteFormSchema(t)),
    defaultValues: getInviteFormDefaults(),
  })

  useEffect(() => {
    if (!props.open) return
    if (!isUpdate || !props.invite) {
      form.reset(getInviteFormDefaults())
      return
    }
    getRegistrationInvite(props.invite.id).then((result) => {
      form.reset(getInviteFormDefaults(result.data ?? props.invite))
    })
  }, [form, isUpdate, props.invite, props.open])

  const onSubmit = async (data: InviteFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = toInvitePayload(data)
      if (isUpdate && props.invite) {
        const result = await updateRegistrationInvite({
          ...payload,
          id: props.invite.id,
        })
        if (result.success) {
          toast.success(t('Registration invitation code updated successfully'))
          props.onOpenChange(false)
          props.onSaved()
        }
      } else {
        const result = await createRegistrationInvite(payload)
        if (result.success) {
          const codes = result.data ?? []
          toast.success(
            t('Successfully created {{count}} registration invitation codes', {
              count: codes.length,
            })
          )
          props.onCreated(codes)
          props.onOpenChange(false)
          props.onSaved()
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetExpiry = (months: number, days: number, hours: number) => {
    form.setValue('expires_at', addTimeToDate(months, days, hours), {
      shouldDirty: true,
    })
  }

  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open)
        if (!open) {
          form.reset(getInviteFormDefaults())
        }
      }}
    >
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[560px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isUpdate
              ? t('Update Registration Invitation Code')
              : t('Create Registration Invitation Code')}
          </SheetTitle>
          <SheetDescription>
            {isUpdate
              ? t('Update invitation code limits and expiration.')
              : t('Create one or more registration invitation codes.')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='registration-invite-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className={sideDrawerFormClassName()}
          >
            <SideDrawerSection>
              {!isUpdate && (
                <FormField
                  control={form.control}
                  name='code'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Custom Invitation Code')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t(
                            'Leave empty to generate automatically'
                          )}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Use 4-64 letters, numbers, hyphens, or underscores.'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='remark'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Remark')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('Optional note for administrators')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='max_uses'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Maximum Uses')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min='0'
                        onChange={(event) =>
                          field.onChange(parseInt(event.target.value, 10) || 0)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Set to 0 for unlimited uses.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='expires_at'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expiration Time')}</FormLabel>
                    <div className='flex flex-col gap-2'>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('Never expires')}
                        />
                      </FormControl>
                      <div className='grid grid-cols-4 gap-1.5 sm:flex sm:gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => handleSetExpiry(0, 0, 0)}
                        >
                          {t('Never')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => handleSetExpiry(1, 0, 0)}
                        >
                          {t('1M')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => handleSetExpiry(0, 7, 0)}
                        >
                          {t('1W')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => handleSetExpiry(0, 1, 0)}
                        >
                          {t('1 Day')}
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isUpdate && (
                <FormField
                  control={form.control}
                  name='count'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Quantity')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min='1'
                          max='100'
                          onChange={(event) =>
                            field.onChange(
                              parseInt(event.target.value, 10) || 1
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t('Create multiple invitation codes at once (1-100).')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Close')}
          </SheetClose>
          <Button
            form='registration-invite-form'
            type='submit'
            disabled={isSubmitting}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function GeneratedCodesDialog(props: {
  codes: string[]
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const codesText = props.codes.join('\n')
  const open = props.codes.length > 0

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader className='text-left'>
          <DialogTitle>{t('Generated Invitation Codes')}</DialogTitle>
          <DialogDescription>
            {t('Created {{count}} registration invitation codes', {
              count: props.codes.length,
            })}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          readOnly
          value={codesText}
          className='max-h-80 min-h-48 resize-none font-mono text-xs'
          onFocus={(event) => event.currentTarget.select()}
        />

        <div className='grid max-h-48 gap-2 overflow-y-auto rounded-md border p-2'>
          {props.codes.map((code) => (
            <div
              key={code}
              className='bg-muted/30 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5'
            >
              <span className='min-w-0 flex-1 truncate font-mono text-xs'>
                {code}
              </span>
              <CopyButton
                value={code}
                tooltip={t('Copy invitation code')}
                successTooltip={t('Invitation code copied!')}
                aria-label={t('Copy invitation code')}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Close')}
          </Button>
          <CopyButton
            value={codesText}
            variant='default'
            size='default'
            tooltip={t('Copy all generated invitation codes')}
            successTooltip={t('Generated invitation codes copied!')}
            aria-label={t('Copy all generated invitation codes')}
          >
            {t('Copy All')}
          </CopyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UsageRecordsDialog(props: {
  invite: RegistrationInvite | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    if (props.invite) {
      setPage(1)
    }
  }, [props.invite])

  const { data, isLoading } = useQuery({
    queryKey: ['registration-invite-usages', props.invite?.id, page],
    queryFn: async () => {
      if (!props.invite) return { items: [], total: 0 }
      const result = await getRegistrationInviteUsages(props.invite.id, {
        p: page,
        page_size: pageSize,
      })
      return {
        items: result.data?.items ?? [],
        total: result.data?.total ?? 0,
      }
    },
    enabled: Boolean(props.invite),
  })

  const usages: RegistrationInviteUsage[] = data?.items ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Dialog open={Boolean(props.invite)} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader className='text-left'>
          <DialogTitle>{t('Usage Records')}</DialogTitle>
          <DialogDescription>
            {props.invite?.code
              ? t('Registration invitation code {{code}} usage history', {
                  code: props.invite.code,
                })
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('User ID')}</TableHead>
                <TableHead>{t('Method')}</TableHead>
                <TableHead>{t('Used At')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className='h-20 text-center'>
                    <Loader2 className='mx-auto h-5 w-5 animate-spin' />
                  </TableCell>
                </TableRow>
              ) : usages.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className='text-muted-foreground h-20 text-center'
                  >
                    {t('No usage records')}
                  </TableCell>
                </TableRow>
              ) : (
                usages.map((usage) => (
                  <TableRow key={usage.id}>
                    <TableCell>
                      <StatusBadge
                        label={t('User {{id}}', { id: usage.user_id })}
                        variant='neutral'
                        copyable={false}
                      />
                    </TableCell>
                    <TableCell>{usage.registration_method || '-'}</TableCell>
                    <TableCell className='font-mono text-xs'>
                      {formatTimestampToDate(usage.used_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className='flex items-center justify-end gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {t('Previous')}
          </Button>
          <span className='text-sm'>
            {page} / {pageCount}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            {t('Next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
