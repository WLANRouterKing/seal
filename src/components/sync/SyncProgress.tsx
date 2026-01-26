import { useTranslation } from 'react-i18next'
import { Stack, Text, RingProgress, Progress, Center } from '@mantine/core'

interface SyncProgressProps {
  current: number
  total: number
  isSending: boolean
}

export function SyncProgress({ current, total, isSending }: SyncProgressProps) {
  const { t } = useTranslation()
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <Stack align="center" gap="lg">
      <RingProgress
        size={120}
        thickness={8}
        roundCaps
        sections={[{ value: percentage, color: 'cyan' }]}
        label={
          <Center>
            <Text size="lg" fw={600}>
              {percentage}%
            </Text>
          </Center>
        }
      />

      <Stack gap={4} align="center">
        <Text size="lg" fw={500}>
          {isSending ? t('sync.sending') || 'Sending...' : t('sync.receiving') || 'Receiving...'}
        </Text>
        <Text c="dimmed" size="sm">
          {current} / {total} {t('sync.chunks') || 'chunks'}
        </Text>
      </Stack>

      <Progress value={percentage} color="cyan" w="100%" maw={300} size="sm" radius="xl" />

      <Text c="dimmed" size="sm">
        {t('sync.doNotClose') || 'Do not close this screen'}
      </Text>
    </Stack>
  )
}
