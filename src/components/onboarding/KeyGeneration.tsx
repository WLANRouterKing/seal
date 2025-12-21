import { useTranslation } from 'react-i18next'
import { Center, Stack, Text, Loader } from '@mantine/core'

export default function KeyGeneration({ isLoading }: { isLoading: boolean }) {
  const { t } = useTranslation()

  return (
    <Center h="100vh">
      <Stack align="center" gap="md">
        <Loader color="cyan" size="lg" />
        <Text size="lg" fw={500}>
          {isLoading ? t('onboarding.generating') : t('onboarding.generated')}
        </Text>
        <Text c="dimmed" ta="center">
          {t('onboarding.generatingDesc')}
        </Text>
      </Stack>
    </Center>
  )
}
