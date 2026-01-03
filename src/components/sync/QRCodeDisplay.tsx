import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Stack, Text, Box, Button, TextInput, Textarea, Group } from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'

interface QRCodeDisplayProps {
  qrData: string
  onCodeEntered: (code: string, answer: string) => void
  onCancel: () => void
}

export function QRCodeDisplay({ qrData, onCodeEntered, onCancel }: QRCodeDisplayProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [answerInput, setAnswerInput] = useState('')
  const [step, setStep] = useState<'qr' | 'code'>('qr')

  // Log QR data size for debugging
  console.log('[QRCodeDisplay] QR data length:', qrData.length, 'bytes')

  const handleCodeChange = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (cleaned.length <= 6) {
      if (cleaned.length > 3) {
        setCode(cleaned.slice(0, 3) + '-' + cleaned.slice(3))
      } else {
        setCode(cleaned)
      }
    }
  }

  const handleSubmit = () => {
    if (code.replace('-', '').length === 6 && answerInput) {
      onCodeEntered(code, answerInput)
    }
  }

  if (step === 'qr') {
    return (
      <Stack align="center" gap="lg">
        <Text c="dimmed" ta="center">{t('sync.showingQR')}</Text>

        <Box p="md" bg="white" style={{ borderRadius: 'var(--mantine-radius-lg)' }}>
          <QRCodeSVG value={qrData} size={300} level="L" includeMargin />
        </Box>

        <Button color="cyan" onClick={() => setStep('code')}>{t('sync.enterCode')}</Button>
        <Button variant="default" onClick={onCancel}>{t('sync.cancel')}</Button>
      </Stack>
    )
  }

  return (
    <Stack align="center" gap="lg">
      <Text c="dimmed" ta="center">
        {t('sync.enterCodeFromDevice') || 'Enter the code shown on the other device'}
      </Text>

      <TextInput
        value={code}
        onChange={(e) => handleCodeChange(e.target.value)}
        placeholder="XXX-XXX"
        maxLength={7}
        size="xl"
        styles={{
          input: {
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: '2rem',
            letterSpacing: '0.2em',
            width: 200,
          }
        }}
        autoFocus
      />

      <Box w="100%">
        <Text size="sm" c="dimmed" mb="xs">
          {t('sync.pasteAnswer') || 'Paste connection data from other device'}
        </Text>
        <Textarea
          value={answerInput}
          onChange={(e) => setAnswerInput(e.target.value)}
          placeholder={t('sync.answerPlaceholder') || 'Paste answer data here...'}
          minRows={3}
          styles={{ input: { fontFamily: 'monospace', fontSize: '0.75rem' } }}
        />
      </Box>

      <Group>
        <Button variant="default" onClick={() => setStep('qr')}>
          {t('sync.back') || 'Back'}
        </Button>
        <Button
          color="cyan"
          onClick={handleSubmit}
          disabled={code.replace('-', '').length !== 6}
        >
          {t('sync.connect') || 'Connect'}
        </Button>
      </Group>

      <Button variant="subtle" c="dimmed" onClick={onCancel}>{t('sync.cancel')}</Button>
    </Stack>
  )
}
