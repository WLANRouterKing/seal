import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack, Text, Paper, Code, Alert, Button, Checkbox, Group, CopyButton } from '@mantine/core'
import { IconAlertTriangle, IconCopy, IconCheck } from '@tabler/icons-react'

interface BackupPhraseProps {
  nsec: string
  onComplete: () => void
}

export default function BackupPhrase({ nsec, onComplete }: BackupPhraseProps) {
  const { t } = useTranslation()
  const [confirmed, setConfirmed] = useState(false)

  return (
    <Stack h="100vh" p="md" justify="space-between">
      <Stack gap="md">
        <Text size="xl" fw={700}>
          {t('backup.title')}
        </Text>
        <Text c="dimmed">{t('backup.subtitle')}</Text>

        <Paper p="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase">
              {t('backup.privateKeyLabel')}
            </Text>
            <CopyButton value={nsec}>
              {({ copied, copy }) => (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={copy}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                >
                  {copied ? t('common.copied') : t('common.copy')}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
            {nsec}
          </Code>
        </Paper>

        <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title={t('common.important')}>
          <Stack gap={4}>
            <Text size="xs">• {t('backup.warnings.neverShare')}</Text>
            <Text size="xs">• {t('backup.warnings.storeSecurely')}</Text>
            <Text size="xs">• {t('backup.warnings.ifLost')}</Text>
          </Stack>
        </Alert>

        <Checkbox
          checked={confirmed}
          onChange={(e) => setConfirmed(e.currentTarget.checked)}
          label={t('backup.confirmLabel')}
        />
      </Stack>

      <Button size="lg" color="cyan" fullWidth onClick={onComplete} disabled={!confirmed}>
        {t('backup.continueButton')}
      </Button>
    </Stack>
  )
}
