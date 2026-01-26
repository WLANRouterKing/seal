import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Container, Title, Text, Stack, Paper, List, ThemeIcon, Group, ActionIcon, Anchor } from '@mantine/core'
import {
  IconShieldCheck,
  IconLock,
  IconServer,
  IconBell,
  IconDeviceMobile,
  IconTrash,
  IconArrowLeft,
} from '@tabler/icons-react'

export default function Privacy() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <Group>
          <ActionIcon variant="subtle" onClick={() => navigate(-1)} size="lg">
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Title order={1}>{t('privacy.title')}</Title>
        </Group>

        <Text c="dimmed" size="sm">
          {t('privacy.lastUpdated')}: 2025-01-26
        </Text>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="teal">
                <IconShieldCheck size={20} />
              </ThemeIcon>
              <Title order={3}>{t('privacy.overview.title')}</Title>
            </Group>
            <Text>{t('privacy.overview.text')}</Text>
          </Stack>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="blue">
                <IconLock size={20} />
              </ThemeIcon>
              <Title order={3}>{t('privacy.encryption.title')}</Title>
            </Group>
            <Text>{t('privacy.encryption.text')}</Text>
            <List spacing="xs" size="sm">
              <List.Item>{t('privacy.encryption.item1')}</List.Item>
              <List.Item>{t('privacy.encryption.item2')}</List.Item>
              <List.Item>{t('privacy.encryption.item3')}</List.Item>
            </List>
          </Stack>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="violet">
                <IconServer size={20} />
              </ThemeIcon>
              <Title order={3}>{t('privacy.relays.title')}</Title>
            </Group>
            <Text>{t('privacy.relays.text')}</Text>
            <List spacing="xs" size="sm">
              <List.Item>{t('privacy.relays.item1')}</List.Item>
              <List.Item>{t('privacy.relays.item2')}</List.Item>
              <List.Item>{t('privacy.relays.item3')}</List.Item>
            </List>
          </Stack>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="orange">
                <IconBell size={20} />
              </ThemeIcon>
              <Title order={3}>{t('privacy.push.title')}</Title>
            </Group>
            <Text>{t('privacy.push.text')}</Text>
            <List spacing="xs" size="sm">
              <List.Item>{t('privacy.push.item1')}</List.Item>
              <List.Item>{t('privacy.push.item2')}</List.Item>
              <List.Item>{t('privacy.push.item3')}</List.Item>
            </List>
          </Stack>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="cyan">
                <IconDeviceMobile size={20} />
              </ThemeIcon>
              <Title order={3}>{t('privacy.localStorage.title')}</Title>
            </Group>
            <Text>{t('privacy.localStorage.text')}</Text>
            <List spacing="xs" size="sm">
              <List.Item>{t('privacy.localStorage.item1')}</List.Item>
              <List.Item>{t('privacy.localStorage.item2')}</List.Item>
              <List.Item>{t('privacy.localStorage.item3')}</List.Item>
            </List>
          </Stack>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon size="lg" radius="md" color="red">
                <IconTrash size={20} />
              </ThemeIcon>
              <Title order={3}>{t('privacy.deletion.title')}</Title>
            </Group>
            <Text>{t('privacy.deletion.text')}</Text>
          </Stack>
        </Paper>

        <Paper p="md" radius="md" withBorder>
          <Stack gap="md">
            <Title order={3}>{t('privacy.contact.title')}</Title>
            <Text>
              {t('privacy.contact.text')}{' '}
              <Anchor href="https://github.com/WLANRouterKing/seal/issues" target="_blank">
                GitHub
              </Anchor>
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
