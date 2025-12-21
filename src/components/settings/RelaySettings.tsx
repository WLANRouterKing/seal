import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  TextInput,
  Button,
  Box,
  ScrollArea,
  Badge,
} from '@mantine/core'
import { IconArrowLeft, IconX } from '@tabler/icons-react'
import { useRelayStore } from '../../stores/relayStore'

interface RelaySettingsProps {
  onBack: () => void
}

export default function RelaySettings({ onBack }: RelaySettingsProps) {
  const { t } = useTranslation()
  const { relays, addRelay, removeRelay } = useRelayStore()
  const [newRelayUrl, setNewRelayUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAddRelay = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      await addRelay(newRelayUrl)
      setNewRelayUrl('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'green'
      case 'connecting': return 'yellow'
      case 'error': return 'red'
      default: return 'gray'
    }
  }

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">{t('relaySettings.title')}</Text>
        </Group>
      </Paper>

      <ScrollArea style={{ flex: 1 }}>
        {/* Add Relay Form */}
        <Box component="form" onSubmit={handleAddRelay} p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Text size="sm" fw={500} mb="xs">{t('relaySettings.addNewRelay')}</Text>
          <Group gap="sm">
            <TextInput
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              placeholder="wss://relay.example.com"
              style={{ flex: 1 }}
              error={error}
            />
            <Button type="submit" disabled={!newRelayUrl.trim()} color="cyan">
              {t('common.add')}
            </Button>
          </Group>
        </Box>

        {/* Relay List */}
        <Box py="xs">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" py="xs">
            {t('relaySettings.connectedRelays', { count: relays.filter(r => r.status === 'connected').length })}
          </Text>

          <Stack gap={0}>
            {relays.map((relay) => (
              <Box
                key={relay.url}
                px="md"
                py="sm"
                style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                    <Badge
                      size="xs"
                      color={getStatusColor(relay.status)}
                      variant="dot"
                    >
                      {relay.status}
                    </Badge>
                    <Text size="sm" truncate style={{ flex: 1 }}>
                      {relay.url}
                    </Text>
                  </Group>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => removeRelay(relay.url)}
                  >
                    <IconX size={18} />
                  </ActionIcon>
                </Group>
              </Box>
            ))}
          </Stack>
        </Box>
      </ScrollArea>
    </Stack>
  )
}
