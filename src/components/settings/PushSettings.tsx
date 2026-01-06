import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import {
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  Box,
  ScrollArea,
  ThemeIcon,
  Alert,
  Button,
  TextInput,
  Switch,
  Loader,
  Code,
} from '@mantine/core'
import {
  IconArrowLeft,
  IconBell,
  IconBellOff,
  IconServer,
  IconCloud,
  IconCheck,
  IconX,
  IconInfoCircle,
  IconExternalLink,
  IconBrandAndroid,
} from '@tabler/icons-react'
import { usePushStore, DEFAULT_PUSH_SERVER, DEFAULT_NTFY_SERVER } from '../../stores/pushStore'
import { pushService } from '../../services/pushService'

const isAndroid = () => Capacitor.getPlatform() === 'android'

interface PushSettingsProps {
  onBack: () => void
}

export default function PushSettings({ onBack }: PushSettingsProps) {
  const { t } = useTranslation()
  const {
    enabled,
    pushServerUrl,
    ntfyServerUrl,
    ntfyTopic,
    unifiedPushEndpoint,
    isRegistered,
    lastError,
    setPushServerUrl,
    setNtfyServerUrl,
  } = usePushStore()

  const [isLoading, setIsLoading] = useState(false)
  const [localPushServer, setLocalPushServer] = useState(pushServerUrl)
  const [localNtfyServer, setLocalNtfyServer] = useState(ntfyServerUrl)
  const [hasDistributor, setHasDistributor] = useState<boolean | null>(null)

  // Check for UnifiedPush distributor on Android
  useEffect(() => {
    if (isAndroid()) {
      pushService.hasUnifiedPushDistributor().then(setHasDistributor)
    }
  }, [])

  const handleToggle = async (checked: boolean) => {
    setIsLoading(true)
    if (checked) {
      await pushService.enable()
    } else {
      await pushService.disable()
    }
    setIsLoading(false)
  }

  const handleSaveServers = async () => {
    setPushServerUrl(localPushServer.trim() || DEFAULT_PUSH_SERVER)
    setNtfyServerUrl(localNtfyServer.trim() || DEFAULT_NTFY_SERVER)

    // Re-register if enabled
    if (enabled) {
      setIsLoading(true)
      await pushService.enable()
      setIsLoading(false)
    }
  }

  // On Android, only push server can be changed (ntfy is handled by distributor)
  const hasChanges = isAndroid()
    ? localPushServer !== pushServerUrl
    : localPushServer !== pushServerUrl || localNtfyServer !== ntfyServerUrl

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">{t('pushSettings.title')}</Text>
        </Group>
      </Paper>

      <ScrollArea style={{ flex: 1 }}>
        <Box py="md">
          {/* Enable/Disable Toggle */}
          <Box px="md" py="sm">
            <Group justify="space-between">
              <Group gap="sm">
                <ThemeIcon
                  variant="light"
                  color={enabled && isRegistered ? 'green' : 'gray'}
                  size={40}
                  radius="md"
                >
                  {enabled && isRegistered ? <IconBell size={20} /> : <IconBellOff size={20} />}
                </ThemeIcon>
                <Box>
                  <Text fw={500}>{t('pushSettings.enablePush')}</Text>
                  <Text size="xs" c="dimmed">
                    {enabled && isRegistered
                      ? t('pushSettings.statusConnected')
                      : t('pushSettings.statusDisconnected')}
                  </Text>
                </Box>
              </Group>
              {isLoading ? (
                <Loader size="sm" />
              ) : (
                <Switch
                  checked={enabled}
                  onChange={(e) => handleToggle(e.currentTarget.checked)}
                  color="green"
                />
              )}
            </Group>
          </Box>

          {/* Android: No distributor warning */}
          {isAndroid() && hasDistributor === false && (
            <Box px="md" py="xs">
              <Alert color="orange" icon={<IconBrandAndroid size={16} />}>
                <Text size="xs" mb="xs">
                  {t('pushSettings.noDistributor', 'No UnifiedPush distributor found. Please install the ntfy app from F-Droid for push notifications to work when the app is closed.')}
                </Text>
                <Text
                  size="xs"
                  c="cyan"
                  component="a"
                  href="https://f-droid.org/packages/io.heckel.ntfy/"
                  target="_blank"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {t('pushSettings.installNtfy', 'Install ntfy from F-Droid')}
                  <IconExternalLink size={12} />
                </Text>
              </Alert>
            </Box>
          )}

          {/* Status */}
          {enabled && (
            <Box px="md" py="xs">
              <Group gap="xs">
                {isRegistered ? (
                  <>
                    <IconCheck size={16} color="var(--mantine-color-green-6)" />
                    <Text size="sm" c="green">{t('pushSettings.registered')}</Text>
                  </>
                ) : (
                  <>
                    <IconX size={16} color="var(--mantine-color-red-6)" />
                    <Text size="sm" c="red">{t('pushSettings.notRegistered')}</Text>
                  </>
                )}
              </Group>
              {/* Show topic for Web/Electron */}
              {!isAndroid() && ntfyTopic && (
                <Text size="xs" c="dimmed" mt={4}>
                  Topic: <Code>{ntfyTopic}</Code>
                </Text>
              )}
              {/* Show endpoint for Android */}
              {isAndroid() && unifiedPushEndpoint && (
                <Text size="xs" c="dimmed" mt={4}>
                  Endpoint: <Code style={{ wordBreak: 'break-all' }}>{unifiedPushEndpoint}</Code>
                </Text>
              )}
            </Box>
          )}

          {/* Error */}
          {lastError && (
            <Box px="md" py="xs">
              <Alert color="red" variant="light">
                {lastError}
              </Alert>
            </Box>
          )}

          {/* Server Configuration */}
          <Box py="md">
            <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" pb="xs">
              {t('pushSettings.serverConfig')}
            </Text>

            <Box px="md" py="sm">
              <Group gap="sm" mb="xs">
                <ThemeIcon variant="light" color="cyan" size={32} radius="md">
                  <IconServer size={18} />
                </ThemeIcon>
                <Text fw={500} size="sm">{t('pushSettings.pushServer')}</Text>
              </Group>
              <TextInput
                placeholder={DEFAULT_PUSH_SERVER}
                value={localPushServer}
                onChange={(e) => setLocalPushServer(e.target.value)}
                size="sm"
              />
              <Text size="xs" c="dimmed" mt={4}>
                {t('pushSettings.pushServerHint')}
              </Text>
            </Box>

            {/* Only show ntfy server config on Web/Electron (Android uses distributor) */}
            {!isAndroid() && (
              <Box px="md" py="sm">
                <Group gap="sm" mb="xs">
                  <ThemeIcon variant="light" color="violet" size={32} radius="md">
                    <IconCloud size={18} />
                  </ThemeIcon>
                  <Text fw={500} size="sm">{t('pushSettings.ntfyServer')}</Text>
                </Group>
                <TextInput
                  placeholder={DEFAULT_NTFY_SERVER}
                  value={localNtfyServer}
                  onChange={(e) => setLocalNtfyServer(e.target.value)}
                  size="sm"
                />
                <Text size="xs" c="dimmed" mt={4}>
                  {t('pushSettings.ntfyServerHint')}
                </Text>
              </Box>
            )}

            {hasChanges && (
              <Box px="md" py="sm">
                <Button
                  fullWidth
                  onClick={handleSaveServers}
                  loading={isLoading}
                >
                  {t('common.save')}
                </Button>
              </Box>
            )}
          </Box>

          {/* Info */}
          <Box px="md" py="md">
            <Alert color="blue" icon={<IconInfoCircle size={16} />}>
              <Text size="xs" mb="xs">
                {t('pushSettings.howItWorks')}
              </Text>
              <Text
                size="xs"
                c="cyan"
                component="a"
                href="https://github.com/WLANRouterKing/seal-push-server"
                target="_blank"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                {t('pushSettings.learnMore')}
                <IconExternalLink size={12} />
              </Text>
            </Alert>
          </Box>

          {/* Self-host hint */}
          <Box px="md" pb="md">
            <Alert color="violet" variant="light">
              <Text size="xs">
                {t('pushSettings.selfHostHint')}
              </Text>
            </Alert>
          </Box>
        </Box>
      </ScrollArea>
    </Stack>
  )
}
