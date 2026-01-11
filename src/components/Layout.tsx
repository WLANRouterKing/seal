import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell, Group, Text, Indicator, UnstyledButton, Stack, ActionIcon, Tooltip } from '@mantine/core'
import { IconMessageCircle, IconUsers, IconSettings, IconLock } from '@tabler/icons-react'
import { useRelayStore } from '../stores/relayStore'
import { useAuthStore } from '../stores/authStore'
import { useMessageStore } from '../stores/messageStore'

export default function Layout() {
  const { t } = useTranslation()
  const { relays } = useRelayStore()
  const { hasPassword, lock } = useAuthStore()
  const { activeChat } = useMessageStore()
  const location = useLocation()

  const connectedCount = relays.filter(r => r.status === 'connected').length

  // Hide nav on onboarding
  if (location.pathname === '/onboarding') {
    return <Outlet />
  }

  return (
    <AppShell
      header={{ height: 56 }}
      footer={activeChat ? undefined : { height: 64 }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Text fw={600} size="lg">Seal</Text>
          <Group gap="md">
            <Group gap="xs">
              <Indicator
                color={connectedCount > 0 ? 'green' : 'red'}
                size={8}
                processing={connectedCount === 0}
              >
                <div />
              </Indicator>
              <Text size="xs" c="dimmed">
                {connectedCount} relay{connectedCount !== 1 ? 's' : ''}
              </Text>
            </Group>
            {hasPassword && (
              <Tooltip label={t('securitySettings.lockNow')}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={lock}
                  aria-label={t('securitySettings.lockNow')}
                >
                  <IconLock size={18} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main style={{ height: activeChat ? 'calc(100vh - 56px)' : 'calc(100vh - 56px - 64px)', overflow: 'hidden' }}>
        <Outlet />
      </AppShell.Main>

      {!activeChat && (
        <AppShell.Footer style={{marginBottom: '10px'}}>
          <Group h="100%" grow>
            <NavButton  to="/" icon={<IconMessageCircle size={24} />} label={t('nav.chats')} />
            <NavButton to="/contacts" icon={<IconUsers size={24} />} label={t('nav.contacts')} />
            <NavButton to="/settings" icon={<IconSettings size={24} />} label={t('nav.settings')} />
          </Group>
        </AppShell.Footer>
      )}
    </AppShell>
  )
}

interface NavButtonProps {
  to: string
  icon: React.ReactNode
  label: string
}

function NavButton({ to, icon, label }: NavButtonProps) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <UnstyledButton
          h="100%"
          w="100%"
          py="xs"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Stack align="center" gap={4}>
            <Text c={isActive ? 'cyan' : 'dimmed'}>{icon}</Text>
            <Text size="xs" c={isActive ? 'cyan' : 'dimmed'}>{label}</Text>
          </Stack>
        </UnstyledButton>
      )}
    </NavLink>
  )
}
