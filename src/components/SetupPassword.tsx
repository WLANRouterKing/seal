import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Center, Stack, Text, ThemeIcon, PasswordInput, Button, Alert, Paper, Code } from '@mantine/core'
import { IconLock, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { useAuthStore } from '../stores/authStore'

interface SetupPasswordProps {
  onComplete: () => void
}

export default function SetupPassword({ onComplete }: SetupPasswordProps) {
  const { t } = useTranslation()
  const { setPassword, keys } = useAuthStore()
  const [password, setPasswordValue] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSetPassword = async () => {
    if (password.length < 6) {
      setError(t('setupPassword.errors.tooShort'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('setupPassword.errors.noMatch'))
      return
    }

    setIsLoading(true)
    setError('')

    const success = await setPassword(password)
    if (success) {
      onComplete()
    } else {
      setError(t('setupPassword.errors.failed'))
    }
    setIsLoading(false)
  }

  return (
    <Center h="100vh" p="md">
      <Stack align="center" gap="lg" maw={360} w="100%">
        <ThemeIcon size={80} radius="xl" variant="light" color="cyan">
          <IconLock size={40} />
        </ThemeIcon>

        <Text size="xl" fw={700} ta="center">
          {t('setupPassword.title')}
        </Text>
        <Text c="dimmed" ta="center">
          {t('setupPassword.subtitle')}
        </Text>

        {keys && (
          <Paper p="sm" withBorder w="100%">
            <Text size="xs" c="dimmed" mb={4}>
              {t('setupPassword.yourPublicKey')}
            </Text>
            <Code style={{ wordBreak: 'break-all' }}>
              {keys.npub.slice(0, 20)}...{keys.npub.slice(-8)}
            </Code>
          </Paper>
        )}

        <Stack gap="md" w="100%">
          <PasswordInput
            label={t('setupPassword.password')}
            placeholder={t('setupPassword.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPasswordValue(e.target.value)}
          />

          <PasswordInput
            label={t('setupPassword.confirmPassword')}
            placeholder={t('setupPassword.confirmPlaceholder')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={16} />}>
              {error}
            </Alert>
          )}

          <Button
            size="lg"
            color="cyan"
            fullWidth
            onClick={handleSetPassword}
            loading={isLoading}
            disabled={!password || !confirmPassword}
          >
            {t('setupPassword.setButton')}
          </Button>
        </Stack>

        <Alert color="yellow" icon={<IconInfoCircle size={16} />} title={t('common.important')}>
          <Text size="xs">{t('setupPassword.importantNote')}</Text>
        </Alert>

        <Button variant="subtle" color="gray" onClick={onComplete}>
          {t('setupPassword.skipButton')}
        </Button>
      </Stack>
    </Center>
  )
}
