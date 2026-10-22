import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Code, CopyButton, Group, Paper, Stack, Text } from '@mantine/core'
import { useLinkedApp } from '../../stores/linkedAppStore'
import { pubkeyToNpub } from '../../services/keys'
import ThemeSettings from './ThemeSettings'
import LanguageSettings from './LanguageSettings'

export default function LinkedAppSettings() {
  const { t } = useTranslation()
  const linked = useLinkedApp()
  const [view, setView] = useState<'main' | 'theme' | 'language'>('main')
  if (!linked) return null
  if (view === 'theme') return <ThemeSettings onBack={() => setView('main')} />
  if (view === 'language') return <LanguageSettings onBack={() => setView('main')} />
  return (
    <Stack p="md">
      <Text size="xl" fw={700}>
        {t('nav.settings')}
      </Text>
      <Paper withBorder p="md">
        <Stack>
          <Text fw={500}>{t('devices.companionTitle')}</Text>
          <Code style={{ overflowWrap: 'anywhere' }}>{pubkeyToNpub(linked.account)}</Code>
          <CopyButton value={pubkeyToNpub(linked.account)}>
            {({ copied, copy }) => (
              <Button variant="light" onClick={copy}>
                {t(copied ? 'common.copied' : 'common.copyNpub')}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Paper>
      <Button variant="default" onClick={() => setView('theme')}>
        {t('settings.theme')}
      </Button>
      <Button variant="default" onClick={() => setView('language')}>
        {t('settings.language')}
      </Button>
      <Alert color="blue">{t('devices.primaryRequired')}</Alert>
      <Text size="sm">{t('devices.attachmentOnPrimary')}</Text>
      <Group>
        <Button onClick={() => linked.lock()}>{t('devices.lock')}</Button>
        <Button
          variant="light"
          onClick={() => {
            void linked.refresh()
          }}
        >
          {t('devices.refresh')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        {t('devices.unlinkHint')}
      </Text>
    </Stack>
  )
}
