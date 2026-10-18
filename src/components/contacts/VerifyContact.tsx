import { useState } from 'react'
import { Alert, Button, Checkbox, Code, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useContactStore } from '../../stores/contactStore'
import { QRCodeScanner } from '../sync/QRCodeScanner'
import { parseContactIdentity } from '../../services/invitations'
import type { Contact } from '../../types'

export default function VerifyContact({ contact }: { contact: Contact }) {
  const { t } = useTranslation()
  const current = useContactStore((state) => state.contacts.find((entry) => entry.pubkey === contact.pubkey))
  const update = useContactStore((state) => state.updateContact)
  const [checked, setChecked] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const saveVerification = async (verified: boolean) => {
    setSaving(true)
    setError('')
    try {
      const saved = await update(contact.pubkey, { verifiedAt: verified ? Date.now() : undefined })
      if (!saved) setError(t('verification.saveError'))
    } catch {
      setError(t('verification.saveError'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Stack gap="sm">
      <Text fw={600}>{t(current?.verifiedAt ? 'verification.verified' : 'verification.title')}</Text>
      <Text size="sm" c="dimmed">
        {t('verification.instructions')}
      </Text>
      <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
        {contact.npub}
      </Code>
      {error && <Alert color="red">{error}</Alert>}
      {scanning ? (
        <QRCodeScanner
          onCancel={() => setScanning(false)}
          onScan={(data) => {
            setScanning(false)
            if (parseContactIdentity(data) !== contact.npub) {
              setChecked(false)
              setError(t('verification.mismatch'))
              return
            }
            setError('')
            setChecked(true)
          }}
        />
      ) : (
        <Button variant="light" onClick={() => setScanning(true)}>
          {t('verification.scan')}
        </Button>
      )}
      <Checkbox
        label={t('verification.confirm')}
        checked={checked}
        onChange={(event) => setChecked(event.currentTarget.checked)}
      />
      <Button disabled={!checked || saving} loading={saving} onClick={() => saveVerification(true)}>
        {t('verification.mark')}
      </Button>
      {current?.verifiedAt && (
        <Button variant="subtle" color="gray" onClick={() => saveVerification(false)} disabled={saving}>
          {t('verification.remove')}
        </Button>
      )}
      <Text size="xs" c="dimmed">
        {t('verification.limit')}
      </Text>
    </Stack>
  )
}
