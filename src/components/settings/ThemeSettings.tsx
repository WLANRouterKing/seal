import { useTranslation } from 'react-i18next'
import { Stack, Group, Text, Paper, ActionIcon, Box, ScrollArea, UnstyledButton, ThemeIcon, Radio } from '@mantine/core'
import { IconArrowLeft, IconMoon, IconSun, IconDeviceDesktop } from '@tabler/icons-react'
import { useThemeStore } from '../../stores/themeStore'

interface ThemeSettingsProps {
  onBack: () => void
}

export default function ThemeSettings({ onBack }: ThemeSettingsProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = useThemeStore()

  const themes = [
    {
      id: 'dark' as const,
      label: t('settings.themeDark'),
      description: t('themeSettings.darkDesc'),
      icon: <IconMoon size={20} />,
      bg: 'dark.7',
    },
    {
      id: 'light' as const,
      label: t('settings.themeLight'),
      description: t('themeSettings.lightDesc'),
      icon: <IconSun size={20} />,
      bg: 'gray.2',
    },
    {
      id: 'system' as const,
      label: t('settings.themeSystem'),
      description: t('themeSettings.systemDesc'),
      icon: <IconDeviceDesktop size={20} />,
      bg: 'dark.5',
    },
  ]

  return (
    <Stack h="100%" gap={0}>
      {/* Header */}
      <Paper p="sm" radius={0} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="sm">
          <ActionIcon variant="subtle" onClick={onBack}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Text fw={500} size="lg">
            {t('themeSettings.title')}
          </Text>
        </Group>
      </Paper>

      <ScrollArea style={{ flex: 1 }}>
        <Box py="md">
          <Text size="xs" fw={500} c="dimmed" tt="uppercase" px="md" pb="xs">
            {t('themeSettings.themeLabel')}
          </Text>

          <Stack gap={0}>
            {themes.map((themeOption) => (
              <UnstyledButton key={themeOption.id} w="100%" onClick={() => setTheme(themeOption.id)} py="sm" px="md">
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon variant="light" size={40} radius="md" bg={themeOption.bg}>
                      {themeOption.icon}
                    </ThemeIcon>
                    <Box>
                      <Text fw={500}>{themeOption.label}</Text>
                      <Text size="xs" c="dimmed">
                        {themeOption.description}
                      </Text>
                    </Box>
                  </Group>
                  <Radio checked={theme === themeOption.id} onChange={() => setTheme(themeOption.id)} color="cyan" />
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </Box>
      </ScrollArea>
    </Stack>
  )
}
