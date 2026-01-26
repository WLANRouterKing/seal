import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Capacitor } from '@capacitor/core'
import {
  Stack,
  Group,
  Text,
  Avatar,
  Paper,
  Box,
  ScrollArea,
  UnstyledButton,
  ThemeIcon,
  CopyButton,
  ActionIcon,
  Tooltip,
} from '@mantine/core'
import {
  IconServer,
  IconRefresh,
  IconPalette,
  IconLock,
  IconKey,
  IconLanguage,
  IconLogout,
  IconChevronRight,
  IconCopy,
  IconCheck,
  IconQrcode,
  IconBell,
  IconCancel,
} from '@tabler/icons-react'
import { useAuthStore } from '../stores/authStore'
import { useRelayStore } from '../stores/relayStore'
import { useThemeStore } from '../stores/themeStore'
import { usePushStore } from '../stores/pushStore'
import { truncateKey } from '../utils/format'
import RelaySettings from '../components/settings/RelaySettings'
import KeyExport from '../components/settings/KeyExport'
import ThemeSettings from '../components/settings/ThemeSettings'
import SecuritySettings from '../components/settings/SecuritySettings'
import LanguageSettings from '../components/settings/LanguageSettings'
import PushSettings from '../components/settings/PushSettings'
import { SyncModal } from '../components/sync/SyncModal'
import MyQRCode from '../components/settings/MyQRCode'
import DeleteAccountModal from '../components/settings/DeleteAccountModal'
import { useBlockedContactStore } from '../stores/blockedContactStore'
import BlockedContactList from '../components/settings/BlockedContactList.tsx'

type SettingsView =
  | 'main'
  | 'relays'
  | 'keys'
  | 'theme'
  | 'security'
  | 'language'
  | 'sync'
  | 'myqr'
  | 'push'
  | 'blockedContacts'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<SettingsView>('main')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const { blockedContacts, removeBlockedContact } = useBlockedContactStore()
  const { keys, hasPassword } = useAuthStore()
  const { relays } = useRelayStore()
  const { theme } = useThemeStore()
  const { enabled: pushEnabled, isRegistered: pushRegistered } = usePushStore()

  const connectedCount = relays.filter((r) => r.status === 'connected').length

  if (view === 'relays') return <RelaySettings onBack={() => setView('main')} />
  if (view === 'push') return <PushSettings onBack={() => setView('main')} />
  if (view === 'keys') return <KeyExport onBack={() => setView('main')} />
  if (view === 'theme') return <ThemeSettings onBack={() => setView('main')} />
  if (view === 'security') return <SecuritySettings onBack={() => setView('main')} />
  if (view === 'language') return <LanguageSettings onBack={() => setView('main')} />
  if (view === 'sync') return <SyncModal onBack={() => setView('main')} />
  if (view === 'myqr') return <MyQRCode onBack={() => setView('main')} />
  if (view === 'blockedContacts')
    return (
      <BlockedContactList
        onBack={() => setView('main')}
        blockedContacts={blockedContacts}
        onUnblockContact={removeBlockedContact}
      />
    )

  const themeLabel =
    theme === 'dark'
      ? t('settings.themeDark')
      : theme === 'light'
        ? t('settings.themeLight')
        : t('settings.themeSystem')
  const languageLabel = i18n.language === 'de' ? 'Deutsch' : 'English'

  return (
    <ScrollArea h="100%">
      <Stack gap={0}>
        {/* Profile Section */}
        <Paper p="md" radius={0}>
          <Group gap="md">
            <Avatar size={64} radius="xl" color="cyan">
              {keys?.npub.charAt(5).toUpperCase() || '?'}
            </Avatar>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="lg">
                {t('settings.yourProfile')}
              </Text>
              <Group gap={4}>
                <CopyButton value={keys?.npub || ''}>
                  {({ copied, copy }) => (
                    <Group gap={4} style={{ cursor: 'pointer' }} onClick={copy}>
                      <Text size="sm" c="dimmed" truncate style={{ maxWidth: 180 }}>
                        {keys ? truncateKey(keys.npub, 12) : t('settings.notLoggedIn')}
                      </Text>
                      <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
                        <ActionIcon variant="subtle" size="sm" color={copied ? 'teal' : 'gray'}>
                          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </CopyButton>
                <Tooltip label={t('myQR.showQR')}>
                  <ActionIcon variant="subtle" size="sm" color="cyan" onClick={() => setView('myqr')}>
                    <IconQrcode size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Box>
          </Group>
        </Paper>

        {/* Network Section */}
        <Box py="xs">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" py="xs">
            {t('settings.network')}
          </Text>

          <SettingsItem
            icon={<IconServer size={20} />}
            iconColor="green"
            title={t('settings.relays')}
            subtitle={t('settings.relaysConnected', { connected: connectedCount, total: relays.length })}
            onClick={() => setView('relays')}
          />

          <SettingsItem
            icon={<IconRefresh size={20} />}
            iconColor="cyan"
            title={t('sync.title')}
            subtitle={t('sync.description')}
            onClick={() => setView('sync')}
          />

          {Capacitor.getPlatform() === 'android' && (
            <SettingsItem
              icon={<IconBell size={20} />}
              iconColor={pushEnabled && pushRegistered ? 'green' : 'orange'}
              title={t('pushSettings.title')}
              subtitle={pushEnabled && pushRegistered ? t('common.enabled') : t('common.disabled')}
              onClick={() => setView('push')}
            />
          )}
        </Box>

        {/* Appearance Section */}
        <Box py="xs">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" py="xs">
            {t('settings.appearance')}
          </Text>

          <SettingsItem
            icon={<IconPalette size={20} />}
            iconColor="violet"
            title={t('settings.theme')}
            subtitle={themeLabel}
            onClick={() => setView('theme')}
          />
        </Box>

        {/* Security Section */}
        <Box py="xs">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" py="xs">
            {t('settings.security')}
          </Text>

          <SettingsItem
            icon={<IconLock size={20} />}
            iconColor={hasPassword ? 'green' : 'orange'}
            title={t('settings.passwordProtection')}
            subtitle={hasPassword ? t('common.enabled') : t('common.notSet')}
            onClick={() => setView('security')}
          />

          <SettingsItem
            icon={<IconKey size={20} />}
            iconColor="yellow"
            title={t('settings.exportKeys')}
            subtitle={t('settings.backupPrivateKey')}
            onClick={() => setView('keys')}
          />
        </Box>

        {/* Language Section */}
        <Box py="xs">
          <SettingsItem
            icon={<IconLanguage size={20} />}
            iconColor="blue"
            title={t('settings.language')}
            subtitle={languageLabel}
            onClick={() => setView('language')}
          />
        </Box>

        {/* Account Section */}
        <Box py="xs">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" py="xs">
            {t('settings.account')}
          </Text>
          <SettingsItem
            icon={<IconCancel size={20} />}
            iconColor="blue"
            title={t('settings.blockedContacts')}
            onClick={() => setView('blockedContacts')}
            subtitle={''}
          />
          <UnstyledButton w="100%" onClick={() => setDeleteModalOpen(true)} py="sm" px="md">
            <Group gap="sm">
              <ThemeIcon variant="light" color="red" size={40} radius="md">
                <IconLogout size={20} />
              </ThemeIcon>
              <Box>
                <Text c="red" fw={500}>
                  {t('deleteAccount.title')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('deleteAccount.buttonHint')}
                </Text>
              </Box>
            </Group>
          </UnstyledButton>
        </Box>

        <DeleteAccountModal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} />

        {/* Footer */}
        <Box py="xl" ta="center">
          <Text size="xs" c="dimmed">
            Seal {__APP_VERSION__}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {t('settings.footer')}
          </Text>
        </Box>
      </Stack>
    </ScrollArea>
  )
}

interface SettingsItemProps {
  icon: React.ReactNode
  iconColor: string
  title: string
  subtitle: string
  onClick: () => void
}

function SettingsItem({ icon, iconColor, title, subtitle, onClick }: SettingsItemProps) {
  return (
    <UnstyledButton w="100%" onClick={onClick} py="sm" px="md">
      <Group justify="space-between">
        <Group gap="sm">
          <ThemeIcon variant="light" color={iconColor} size={40} radius="md">
            {icon}
          </ThemeIcon>
          <Box>
            <Text fw={500}>{title}</Text>
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          </Box>
        </Group>
        <IconChevronRight size={20} color="var(--mantine-color-dimmed)" />
      </Group>
    </UnstyledButton>
  )
}
