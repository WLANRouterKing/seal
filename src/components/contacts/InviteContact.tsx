import { Stack, Text, Button, CopyButton, Box } from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'
import { createInvitation } from '../../services/invitations'

export default function InviteContact() {
  const { t } = useTranslation()
  const npub = useAuthStore((state) => state.keys?.npub)
  if (!npub) return null
  const link = createInvitation(npub)
  return (
    <Stack align="center" gap="lg">
      <Text size="sm" c="dimmed" ta="center">
        {t('invite.description')}
      </Text>
      <Box p="md" bg="white" style={{ borderRadius: 16 }}>
        <QRCodeSVG value={link} size={208} title={t('invite.title')} />
      </Box>
      <CopyButton value={link}>
        {({ copied, copy }) => (
          <Button fullWidth onClick={copy}>
            {t(copied ? 'common.copied' : 'invite.copyLink')}
          </Button>
        )}
      </CopyButton>
      <Text size="xs" c="dimmed" ta="center">
        {t('invite.publicOnly')}
      </Text>
    </Stack>
  )
}
