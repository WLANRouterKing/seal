import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  Textarea,
  TextInput,
  Button,
  Alert,
  SegmentedControl,
  Box,
} from '@mantine/core'
import { IconX, IconAlertCircle } from '@tabler/icons-react'
import { QRCodeScanner } from '../sync/QRCodeScanner'

interface AddContactProps {
  onAdd: (npub: string, name?: string) => void
  onCancel: () => void
  error: string | null
}

type InputMode = 'manual' | 'scan'

export default function AddContact({ onAdd, onCancel, error }: AddContactProps) {
  const { t } = useTranslation()
  const [npub, setNpub] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<InputMode>('manual')
  const [scanError, setScanError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (npub.trim()) {
      onAdd(npub.trim(), name.trim() || undefined)
    }
  }

  const handleScan = (data: string) => {
    setScanError(null)
    if (data.startsWith('npub1')) {
      setNpub(data)
      setMode('manual')
    } else {
      setScanError(t('contacts.invalidQR'))
    }
  }

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onCancel}>
            <IconX size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">
            {t('contacts.addContact')}
          </Text>
        </Group>
      </Paper>

      {/* Mode Toggle */}
      <Box px="md" pt="md">
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(value) => {
            setMode(value as InputMode)
            setScanError(null)
          }}
          data={[
            { label: t('contacts.enterManually'), value: 'manual' },
            { label: t('contacts.scanQR'), value: 'scan' },
          ]}
        />
      </Box>

      {mode === 'manual' ? (
        <Box component="form" onSubmit={handleSubmit} p="md" style={{ flex: 1 }}>
          <Stack gap="md">
            <Textarea
              label={t('contacts.publicKeyLabel')}
              description={t('contacts.publicKeyHint')}
              placeholder="npub1..."
              value={npub}
              onChange={(e) => setNpub(e.target.value)}
              minRows={3}
              autoComplete="off"
              spellCheck={false}
              styles={{ input: { fontFamily: 'monospace', fontSize: '0.875rem' } }}
            />

            <TextInput
              label={t('contacts.nameLabel')}
              description={t('contacts.nameHint')}
              placeholder={t('contacts.displayNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}

            <Button type="submit" fullWidth color="cyan" disabled={!npub.trim()}>
              {t('contacts.addContact')}
            </Button>
          </Stack>
        </Box>
      ) : (
        <Box p="md" style={{ flex: 1 }}>
          <Text c="dimmed" size="sm" ta="center" mb="md">
            {t('contacts.scanQRHint')}
          </Text>

          {scanError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />} mb="md">
              {scanError}
            </Alert>
          )}

          <QRCodeScanner onScan={handleScan} onCancel={() => setMode('manual')} />
        </Box>
      )}
    </Stack>
  )
}
