import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Stack,
  Text,
  Button,
  Group,
  Alert,
  Checkbox,
  Loader,
  ThemeIcon,
  Box,
} from '@mantine/core'
import { IconAlertTriangle, IconTrash, IconCheck, IconX } from '@tabler/icons-react'
import { useAuthStore } from '../../stores/authStore'
import { useRelayStore } from '../../stores/relayStore'
import { createVanishRequest } from '../../services/crypto'
import { nsecToPrivateKey } from '../../services/keys'
import { relayPool } from '../../services/relay'

interface DeleteAccountModalProps {
  opened: boolean
  onClose: () => void
}

type DeleteState = 'confirm' | 'publishing' | 'done' | 'error'

interface PublishResult {
  successes: number
  failures: number
}

export default function DeleteAccountModal({ opened, onClose }: DeleteAccountModalProps) {
  const { t } = useTranslation()
  const { keys, logout } = useAuthStore()
  const { relays } = useRelayStore()
  const [sendVanish, setSendVanish] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [state, setState] = useState<DeleteState>('confirm')
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null)

  const connectedRelays = relays.filter(r => r.status === 'connected')

  const handleDelete = async () => {
    if (!keys) return
    const privateKey = nsecToPrivateKey(keys.nsec)
    if (!privateKey) return

    setState('publishing')

    try {
      if (sendVanish) {
        // Create and publish NIP-62 vanish request
        const vanishEvent = createVanishRequest(privateKey)
        const connectedUrls = connectedRelays.map(r => r.url)

        if (connectedUrls.length > 0) {
          const result = await relayPool.publish(connectedUrls, vanishEvent)
          setPublishResult({
            successes: result.successes.length,
            failures: result.failures.length
          })
        }
      }

      setState('done')

      // Wait a moment to show result, then logout
      setTimeout(() => {
        logout()
      }, 2000)
    } catch (error) {
      console.error('Failed to publish vanish request:', error)
      setState('error')
    }
  }

  const handleClose = () => {
    if (state === 'publishing') return // Don't close while publishing
    setState('confirm')
    setConfirmed(false)
    setSendVanish(true)
    setPublishResult(null)
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t('deleteAccount.title')}
      centered
      closeOnClickOutside={state !== 'publishing'}
      closeOnEscape={state !== 'publishing'}
      withCloseButton={state !== 'publishing'}
    >
      {state === 'confirm' && (
        <Stack gap="md">
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm" fw={500}>{t('deleteAccount.warning')}</Text>
          </Alert>

          <Text size="sm" c="dimmed">
            {t('deleteAccount.description')}
          </Text>

          <Box py="xs">
            <Checkbox
              checked={sendVanish}
              onChange={(e) => setSendVanish(e.currentTarget.checked)}
              label={t('deleteAccount.sendVanish')}
              description={t('deleteAccount.sendVanishHint', { count: connectedRelays.length })}
            />
          </Box>

          <Box py="xs">
            <Checkbox
              checked={confirmed}
              onChange={(e) => setConfirmed(e.currentTarget.checked)}
              label={t('deleteAccount.confirmLabel')}
              color="red"
            />
          </Box>

          <Group>
            <Button variant="default" onClick={handleClose} style={{ flex: 1 }}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              onClick={handleDelete}
              disabled={!confirmed}
              leftSection={<IconTrash size={16} />}
              style={{ flex: 1 }}
            >
              {t('deleteAccount.deleteButton')}
            </Button>
          </Group>
        </Stack>
      )}

      {state === 'publishing' && (
        <Stack align="center" gap="md" py="xl">
          <Loader color="red" size="lg" />
          <Text>{t('deleteAccount.publishing')}</Text>
          <Text size="sm" c="dimmed">{t('deleteAccount.doNotClose')}</Text>
        </Stack>
      )}

      {state === 'done' && (
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={60} radius="xl" color="green">
            <IconCheck size={32} />
          </ThemeIcon>
          <Text fw={500}>{t('deleteAccount.done')}</Text>
          {publishResult && sendVanish && (
            <Text size="sm" c="dimmed">
              {t('deleteAccount.publishResult', {
                successes: publishResult.successes,
                failures: publishResult.failures
              })}
            </Text>
          )}
          <Text size="sm" c="dimmed">{t('deleteAccount.redirecting')}</Text>
        </Stack>
      )}

      {state === 'error' && (
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={60} radius="xl" color="red">
            <IconX size={32} />
          </ThemeIcon>
          <Text fw={500}>{t('deleteAccount.error')}</Text>
          <Text size="sm" c="dimmed">{t('deleteAccount.errorHint')}</Text>
          <Group>
            <Button variant="default" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={() => logout()}>
              {t('deleteAccount.deleteAnywayButton')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
