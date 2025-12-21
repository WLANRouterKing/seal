import { useTranslation } from 'react-i18next'
import {
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  Box,
  ScrollArea,
  UnstyledButton,
  ThemeIcon,
  Radio,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'

interface LanguageSettingsProps {
  onBack: () => void
}

export default function LanguageSettings({ onBack }: LanguageSettingsProps) {
  const { t, i18n } = useTranslation()

  const languages = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'de', label: 'German', native: 'Deutsch' },
  ]

  const handleChange = (code: string) => {
    i18n.changeLanguage(code)
  }

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">{t('settings.language')}</Text>
        </Group>
      </Paper>

      <ScrollArea style={{ flex: 1 }}>
        <Box py="md">
          <Stack gap={0}>
            {languages.map((lang) => (
              <UnstyledButton
                key={lang.code}
                w="100%"
                onClick={() => handleChange(lang.code)}
                py="sm"
                px="md"
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon variant="light" color="blue" size={40} radius="md">
                      <Text size="sm" fw={500}>{lang.code.toUpperCase()}</Text>
                    </ThemeIcon>
                    <Box>
                      <Text fw={500}>{lang.native}</Text>
                      <Text size="xs" c="dimmed">{lang.label}</Text>
                    </Box>
                  </Group>
                  <Radio
                    checked={i18n.language.startsWith(lang.code)}
                    onChange={() => handleChange(lang.code)}
                    color="cyan"
                  />
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </Box>
      </ScrollArea>
    </Stack>
  )
}
