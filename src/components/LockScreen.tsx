import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Center,
  Stack,
  Text,
  ThemeIcon,
  PasswordInput,
  Button,
  Alert,
} from '@mantine/core'
import { IconLock, IconAlertTriangle } from '@tabler/icons-react'
import { useAuthStore } from '../stores/authStore'
import { truncateKey } from '../utils/format'

export default function LockScreen() {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const { unlock, publicInfo, isLoading, error, clearError, logout } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (password.trim()) {
      await unlock(password)
      setPassword('')
    }
  }

  return (
    <Center h="100vh" p="md">
      <Stack align="center" gap="lg" maw={320} w="100%">
        <ThemeIcon size={80} radius="xl" variant="light" color="cyan">
          <IconLock size={40} />
        </ThemeIcon>

        <Text size="xl" fw={700}>{t('lockScreen.title')}</Text>

        {publicInfo && (
          <Text c="dimmed" size="sm">
            {truncateKey(publicInfo.npub, 12)}
          </Text>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <Stack gap="md">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('lockScreen.placeholder')}
              autoFocus
              autoComplete="current-password"
              size="lg"
              styles={{ input: { textAlign: 'center' } }}
            />

            {error && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              size="lg"
              color="cyan"
              fullWidth
              disabled={!password.trim()}
              loading={isLoading}
            >
              {t('lockScreen.unlock')}
            </Button>
          </Stack>
        </form>

        <Button
          variant="subtle"
          color="red"
          onClick={logout}
        >
          {t('lockScreen.logout')}
        </Button>
      </Stack>
    </Center>
  )
}
