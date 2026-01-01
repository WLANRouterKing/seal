import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  Box,
  ScrollArea,
  UnstyledButton,
  ThemeIcon,
  Alert,
  Button,
  PasswordInput,
  Anchor,
  Switch,
  Modal,
} from '@mantine/core'
import {
  IconArrowLeft,
  IconLock,
  IconLockOpen,
  IconShield,
  IconWorld,
  IconExternalLink,
  IconAlertTriangle,
  IconInfoCircle,
  IconEyeOff,
} from '@tabler/icons-react'
import { useAuthStore } from '../../stores/authStore'

interface SecuritySettingsProps {
  onBack: () => void
}

export default function SecuritySettings({ onBack }: SecuritySettingsProps) {
  const { t } = useTranslation()
  const { hasPassword, lock, hideIdentity, setHideIdentity } = useAuthStore()
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [showRemovePassword, setShowRemovePassword] = useState(false)
  const [showHideIdentityModal, setShowHideIdentityModal] = useState(false)
  const [pendingHideIdentity, setPendingHideIdentity] = useState(false)
  const [hideIdentityPassword, setHideIdentityPassword] = useState('')
  const [hideIdentityError, setHideIdentityError] = useState('')
  const [hideIdentityLoading, setHideIdentityLoading] = useState(false)

  const handleHideIdentityToggle = (checked: boolean) => {
    setPendingHideIdentity(checked)
    setShowHideIdentityModal(true)
    setHideIdentityPassword('')
    setHideIdentityError('')
  }

  const confirmHideIdentity = async () => {
    setHideIdentityLoading(true)
    setHideIdentityError('')
    const success = await setHideIdentity(pendingHideIdentity, hideIdentityPassword)
    setHideIdentityLoading(false)
    if (success) {
      setShowHideIdentityModal(false)
    } else {
      setHideIdentityError(t('securitySettings.errors.incorrect'))
    }
  }

  if (showSetPassword) {
    return (
      <Stack h="100%" gap={0}>
        <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Group gap="sm">
            <ActionIcon variant="subtle" onClick={() => setShowSetPassword(false)}>
              <IconArrowLeft size={24} />
            </ActionIcon>
            <Text fw={500} size="lg">{t('securitySettings.title')}</Text>
          </Group>
        </Paper>
        <SetPasswordForm
          onSuccess={() => setShowSetPassword(false)}
          onCancel={() => setShowSetPassword(false)}
        />
      </Stack>
    )
  }

  if (showRemovePassword) {
    return (
      <Stack h="100%" gap={0}>
        <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Group gap="sm">
            <ActionIcon variant="subtle" onClick={() => setShowRemovePassword(false)}>
              <IconArrowLeft size={24} />
            </ActionIcon>
            <Text fw={500} size="lg">{t('securitySettings.title')}</Text>
          </Group>
        </Paper>
        <RemovePasswordForm
          onSuccess={() => setShowRemovePassword(false)}
          onCancel={() => setShowRemovePassword(false)}
        />
      </Stack>
    )
  }

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">{t('securitySettings.title')}</Text>
        </Group>
      </Paper>

      <ScrollArea style={{ flex: 1 }}>
        <Box py="md">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" pb="xs">
            {t('securitySettings.passwordProtection')}
          </Text>

          {!hasPassword ? (
            <UnstyledButton w="100%" onClick={() => setShowSetPassword(true)} py="sm" px="md">
              <Group justify="space-between">
                <Group gap="sm">
                  <ThemeIcon variant="light" color="green" size={40} radius="md">
                    <IconLock size={20} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={500}>{t('securitySettings.setPassword')}</Text>
                    <Text size="xs" c="dimmed">{t('securitySettings.setPasswordHint')}</Text>
                  </Box>
                </Group>
              </Group>
            </UnstyledButton>
          ) : (
            <Stack gap={0}>
              <Box px="md" py="sm">
                <Group gap="sm">
                  <ThemeIcon variant="light" color="green" size={40} radius="md">
                    <IconShield size={20} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={500}>{t('securitySettings.passwordEnabled')}</Text>
                    <Text size="xs" c="green">{t('securitySettings.keysProtected')}</Text>
                  </Box>
                </Group>
              </Box>

              <UnstyledButton w="100%" onClick={lock} py="sm" px="md">
                <Group gap="sm">
                  <ThemeIcon variant="light" color="cyan" size={40} radius="md">
                    <IconLock size={20} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={500}>{t('securitySettings.lockNow')}</Text>
                    <Text size="xs" c="dimmed">{t('securitySettings.lockNowHint')}</Text>
                  </Box>
                </Group>
              </UnstyledButton>

              <UnstyledButton w="100%" onClick={() => setShowRemovePassword(true)} py="sm" px="md">
                <Group gap="sm">
                  <ThemeIcon variant="light" color="red" size={40} radius="md">
                    <IconLockOpen size={20} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={500} c="red">{t('securitySettings.removePassword')}</Text>
                    <Text size="xs" c="dimmed">{t('securitySettings.removePasswordHint')}</Text>
                  </Box>
                </Group>
              </UnstyledButton>

              {/* Hide Identity Toggle */}
              <Box px="md" py="sm">
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon variant="light" color="violet" size={40} radius="md">
                      <IconEyeOff size={20} />
                    </ThemeIcon>
                    <Box>
                      <Text fw={500}>{t('securitySettings.hideIdentity')}</Text>
                      <Text size="xs" c="dimmed">{t('securitySettings.hideIdentityHint')}</Text>
                    </Box>
                  </Group>
                  <Switch
                    checked={hideIdentity}
                    onChange={(e) => handleHideIdentityToggle(e.currentTarget.checked)}
                    color="violet"
                  />
                </Group>
              </Box>
            </Stack>
          )}
        </Box>

        {/* Tor Recommendation */}
        <Box py="md" px="md">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" pb="xs">
            {t('securitySettings.networkPrivacy')}
          </Text>
          <Alert
            color="violet"
            icon={<IconWorld size={16} />}
          >
            <Text size="xs" mb="xs">{t('securitySettings.torHint')}</Text>
            <Anchor
              href="https://www.torproject.org/download/"
              target="_blank"
              size="xs"
            >
              <Group gap={4}>
                {t('securitySettings.downloadTor')}
                <IconExternalLink size={12} />
              </Group>
            </Anchor>
          </Alert>
        </Box>

        {/* Info Alert */}
        <Box px="md" pb="md">
          <Alert
            color="yellow"
            icon={<IconInfoCircle size={16} />}
            title={t('common.important')}
          >
            <Text size="xs">
              {hasPassword
                ? t('securitySettings.importantWithPassword')
                : t('securitySettings.importantWithoutPassword')}
            </Text>
          </Alert>
        </Box>
      </ScrollArea>

      {/* Hide Identity Password Confirmation Modal */}
      <Modal
        opened={showHideIdentityModal}
        onClose={() => setShowHideIdentityModal(false)}
        title={t('securitySettings.hideIdentityConfirmTitle')}
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {pendingHideIdentity
              ? t('securitySettings.hideIdentityConfirmEnable')
              : t('securitySettings.hideIdentityConfirmDisable')}
          </Text>
          <PasswordInput
            label={t('securitySettings.currentPasswordLabel')}
            placeholder={t('securitySettings.currentPasswordPlaceholder')}
            value={hideIdentityPassword}
            onChange={(e) => setHideIdentityPassword(e.target.value)}
            autoComplete="current-password"
          />
          {hideIdentityError && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {hideIdentityError}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowHideIdentityModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              color="violet"
              onClick={confirmHideIdentity}
              loading={hideIdentityLoading}
              disabled={!hideIdentityPassword}
            >
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

function SetPasswordForm({
  onSuccess,
  onCancel
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [password, setPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { setPassword } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError(t('securitySettings.errors.tooShort'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('securitySettings.errors.noMatch'))
      return
    }

    setIsLoading(true)
    const success = await setPassword(password)
    setIsLoading(false)

    if (success) {
      onSuccess()
    } else {
      setError(t('securitySettings.errors.setFailed'))
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} p="md" style={{ flex: 1 }}>
      <Text size="xl" fw={600} mb="xs">{t('securitySettings.createPasswordTitle')}</Text>
      <Text size="sm" c="dimmed" mb="lg">{t('securitySettings.createPasswordHint')}</Text>

      <Stack gap="md">
        <PasswordInput
          label={t('securitySettings.passwordLabel')}
          placeholder={t('securitySettings.passwordPlaceholder')}
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          autoComplete="new-password"
        />

        <PasswordInput
          label={t('securitySettings.confirmPasswordLabel')}
          placeholder={t('securitySettings.confirmPasswordPlaceholder')}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
        )}

        <Group mt="md">
          <Button variant="default" onClick={onCancel} style={{ flex: 1 }}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            color="cyan"
            loading={isLoading}
            disabled={!password || !confirmPassword}
            style={{ flex: 1 }}
          >
            {t('securitySettings.setPasswordButton')}
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}

function RemovePasswordForm({
  onSuccess,
  onCancel
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [password, setPasswordValue] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { removePassword } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    setIsLoading(true)
    const success = await removePassword(password)
    setIsLoading(false)

    if (success) {
      onSuccess()
    } else {
      setError(t('securitySettings.errors.incorrect'))
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} p="md" style={{ flex: 1 }}>
      <Text size="xl" fw={600} mb="xs">{t('securitySettings.removePasswordTitle')}</Text>
      <Text size="sm" c="dimmed" mb="lg">{t('securitySettings.removePasswordHint2')}</Text>

      <Stack gap="md">
        <PasswordInput
          label={t('securitySettings.currentPasswordLabel')}
          placeholder={t('securitySettings.currentPasswordPlaceholder')}
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          autoComplete="current-password"
        />

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {error}
          </Alert>
        )}

        <Group mt="md">
          <Button variant="default" onClick={onCancel} style={{ flex: 1 }}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            color="red"
            loading={isLoading}
            disabled={!password}
            style={{ flex: 1 }}
          >
            {t('securitySettings.removePasswordButton')}
          </Button>
        </Group>
      </Stack>
    </Box>
  )
}
