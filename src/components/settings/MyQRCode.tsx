import { useTranslation } from 'react-i18next'
import { Stack, Group, Text, Paper, Box, ActionIcon, CopyButton, Tooltip } from '@mantine/core'
import { IconArrowLeft, IconCopy, IconCheck } from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuthStore } from '../../stores/authStore'

interface MyQRCodeProps {
  onBack: () => void
}

export default function MyQRCode({ onBack }: MyQRCodeProps) {
  const { t } = useTranslation()
  const { keys } = useAuthStore()
  const npub = keys?.npub || ''

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">
            {t('myQR.title')}
          </Text>
        </Group>
      </Paper>

      {/* Content */}
      <Stack align="center" justify="center" gap="xl" p="xl" style={{ flex: 1 }}>
        <Text c="dimmed" ta="center" size="sm">
          {t('myQR.hint')}
        </Text>

        <Box p="lg" bg="white" style={{ borderRadius: 'var(--mantine-radius-lg)' }}>
          <QRCodeSVG value={npub} size={250} level="M" includeMargin={false} />
        </Box>

        <CopyButton value={npub}>
          {({ copied, copy }) => (
            <Paper
              p="md"
              radius="md"
              withBorder
              style={{ cursor: 'pointer', maxWidth: 300, width: '100%' }}
              onClick={copy}
            >
              <Group justify="space-between" wrap="nowrap">
                <Text
                  size="xs"
                  ff="monospace"
                  c="dimmed"
                  style={{
                    wordBreak: 'break-all',
                    flex: 1,
                  }}
                >
                  {npub}
                </Text>
                <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                  <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'}>
                    {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Paper>
          )}
        </CopyButton>

        <Text c="dimmed" ta="center" size="xs" maw={280}>
          {t('myQR.shareInfo')}
        </Text>
      </Stack>
    </Stack>
  )
}
