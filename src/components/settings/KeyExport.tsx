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
  Button,
  Code,
  Alert,
  CopyButton,
  Tooltip,
} from '@mantine/core'
import { IconArrowLeft, IconCopy, IconCheck, IconAlertTriangle, IconEye, IconEyeOff } from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuthStore } from '../../stores/authStore'

interface KeyExportProps {
  onBack: () => void
}

export default function KeyExport({ onBack }: KeyExportProps) {
  const { t } = useTranslation()
  const { keys } = useAuthStore()
  const [showPrivate, setShowPrivate] = useState(false)
  const [showQR, setShowQR] = useState(false)

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">{t('keyExport.title')}</Text>
        </Group>
      </Paper>

      <ScrollArea style={{ flex: 1 }} p="md">
        <Stack gap="lg">
          {/* Public Key */}
          <Box>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>{t('keyExport.publicKeyLabel')}</Text>
              <CopyButton value={keys?.npub || ''}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={copy}
                      leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    >
                      {copied ? t('common.copied') : t('common.copy')}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Paper p="sm" withBorder>
              <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                {keys?.npub}
              </Code>
            </Paper>
            <Text size="xs" c="dimmed" mt="xs">
              {t('keyExport.publicKeyHint')}
            </Text>
          </Box>

          {/* Private Key */}
          <Box>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>{t('keyExport.privateKeyLabel')}</Text>
              <Group gap="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setShowPrivate(!showPrivate)}
                  leftSection={showPrivate ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                >
                  {showPrivate ? t('common.hide') : t('common.show')}
                </Button>
                {showPrivate && (
                  <CopyButton value={keys?.nsec || ''}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={copy}
                          leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        >
                          {copied ? t('common.copied') : t('common.copy')}
                        </Button>
                      </Tooltip>
                    )}
                  </CopyButton>
                )}
              </Group>
            </Group>
            <Paper p="sm" withBorder>
              <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                {showPrivate ? keys?.nsec : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
              </Code>
            </Paper>
          </Box>

          {/* QR Code */}
          <Box>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>{t('keyExport.qrCodeLabel') || 'QR Code for Import'}</Text>
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setShowQR(!showQR)}
                leftSection={showQR ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              >
                {showQR ? t('common.hide') : t('common.show')}
              </Button>
            </Group>
            {showQR && keys?.nsec && (
              <Paper p="md" withBorder>
                <Stack align="center" gap="sm">
                  <Box p="sm" bg="white" style={{ borderRadius: 8 }}>
                    <QRCodeSVG
                      value={keys.nsec}
                      size={200}
                      level="M"
                      includeMargin={false}
                    />
                  </Box>
                  <Text size="xs" c="dimmed" ta="center">
                    {t('keyExport.qrCodeHint') || 'Scan this QR code on another device to import your account'}
                  </Text>
                </Stack>
              </Paper>
            )}
            {!showQR && (
              <Text size="xs" c="dimmed">
                {t('keyExport.qrCodeDescription') || 'Show QR code to easily import your key on another device'}
              </Text>
            )}
          </Box>

          {/* Warning */}
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title={t('common.warning')}>
            <Stack gap={4}>
              <Text size="xs">• {t('keyExport.warnings.neverShare')}</Text>
              <Text size="xs">• {t('keyExport.warnings.impersonate')}</Text>
              <Text size="xs">• {t('keyExport.warnings.storeSecurely')}</Text>
            </Stack>
          </Alert>
        </Stack>
      </ScrollArea>
    </Stack>
  )
}
