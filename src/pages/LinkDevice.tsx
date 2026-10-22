import { IndependentSession } from '../services/devices/independent'
import { useLinkedAppStore } from '../stores/linkedAppStore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Code,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { QRCodeSVG } from 'qrcode.react'
import { npubToPubkey, pubkeyToNpub } from '../services/keys'
import { CompanionSession, type CompanionState } from '../services/devices/session'
import { LinkedVault, hasLinkedVault, deleteLinkedVault } from '../services/devices/storage'
import { DeviceTransport, exclusiveDeviceSession } from '../services/devices/transport'
import { inspectRequest, makeRequest, newDeviceSecret, now, randomId } from '../services/devices/protocol'

type Phase = 'loading' | 'setup' | 'locked' | 'pairing' | 'grant' | 'removed'
export default function LinkDevice() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const notice = useLinkedAppStore((state) => state.notice)
  const transferred = useRef(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [qr, setQR] = useState('')
  const [code, setCode] = useState('')
  const [eraseConfirm, setEraseConfirm] = useState(false)
  const session = useRef<CompanionSession | undefined>(undefined)
  const vault = useRef(new LinkedVault<CompanionState>())
  const release = useRef<(() => void) | undefined>(undefined)
  const alive = useRef(true)
  const working = useRef(false)
  const epoch = useRef(0)
  const lock = useCallback(() => {
    epoch.current++
    session.current?.close()
    session.current = undefined
    vault.current.lock()
    release.current?.()
    release.current = undefined
    setPassword('')
    setRepeat('')
    setQR('')
    setCode('')
    setConfirmed(false)
    setPhase('locked')
  }, [])
  useEffect(() => {
    alive.current = true
    const currentVault = vault.current
    hasLinkedVault()
      .then((exists) => {
        if (alive.current) setPhase(exists ? 'locked' : 'setup')
      })
      .catch(() => {
        if (alive.current) setError(t('devices.storageFailed'))
      })
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(lock, 5 * 60 * 1000)
    }
    const hidden = () => {
      if (document.hidden && session.current) lock()
    }
    window.addEventListener('pointerdown', reset)
    window.addEventListener('keydown', reset)
    document.addEventListener('visibilitychange', hidden)
    reset()
    return () => {
      alive.current = false
      clearTimeout(timer)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
      document.removeEventListener('visibilitychange', hidden)
      if (!transferred.current) {
        session.current?.close()
        currentVault.lock()
        release.current?.()
      }
    }
  }, [lock, t])
  const enterApp = () => {
    const client = session.current
    const unlock = release.current
    if (!client || !unlock || !client.state.confirmed) throw new Error('Device not confirmed')
    const independent = new IndependentSession(client.state, vault.current)
    client.close()
    transferred.current = true
    session.current = undefined
    release.current = undefined
    useLinkedAppStore.getState().activate({ session: independent, vault: vault.current, release: unlock })
    navigate('/', { replace: true })
  }
  const connect = (state: CompanionState) => {
    const info = state.confirmed
      ? undefined
      : inspectRequest(JSON.stringify(state.request), state.host ? state.request.created_at : now())
    setAccount(pubkeyToNpub(state.account))
    if (info) {
      setQR(JSON.stringify(state.request))
      setCode(info.code)
    }
    session.current = new CompanionSession(
      state,
      vault.current,
      (urls) => new DeviceTransport(urls),
      (status) => {
        if (!alive.current) return
        if (status === 'removed') {
          lock()
          setPhase('removed')
        } else setPhase('grant')
      }
    )
    if (state.confirmed) enterApp()
    else setPhase(state.host ? 'grant' : 'pairing')
  }
  const perform = async (action: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    const issued = epoch.current
    try {
      await action()
    } catch (err) {
      if (alive.current && issued === epoch.current) setError((err as Error).message)
    } finally {
      working.current = false
      if (alive.current) setBusy(false)
    }
  }
  const start = () =>
    perform(async () => {
      const issued = epoch.current
      const unlock = await exclusiveDeviceSession('companion')
      if (!alive.current || issued !== epoch.current) {
        unlock()
        return
      }
      release.current = unlock
      try {
        let state: CompanionState
        if (phase === 'locked') state = await vault.current.unlock(password)
        else {
          const pubkey = npubToPubkey(account.trim())
          if (!pubkey || !name.trim() || password.length < 12 || password !== repeat)
            throw new Error(t('devices.invalidSetup'))
          const secret = newDeviceSecret()
          const request = makeRequest(secret, {
            account: pubkey,
            name: name.trim(),
            relays: ['wss://nos.lol'],
            expires: now() + 300,
            session: randomId(),
          })
          state = { account: pubkey, secret, request, confirmed: false, seq: 0 }
          await vault.current.create(password, state)
        }
        if (!alive.current || issued !== epoch.current) {
          vault.current.lock()
          return
        }
        setPassword('')
        setRepeat('')
        connect(state)
      } catch (err) {
        session.current?.close()
        session.current = undefined
        vault.current.lock()
        release.current?.()
        release.current = undefined
        throw err
      }
    })
  return (
    <Stack p="md" maw={720} mx="auto" style={{ minHeight: '100dvh' }}>
      <Group justify="space-between">
        <Text size="xl" fw={700}>
          {t('devices.companionTitle')}
        </Text>
        <Anchor component={Link} to="/">
          {t('common.back')}
        </Anchor>
      </Group>
      <Alert color="blue">{t('devices.primaryRequired')}</Alert>
      {error && <Alert color="red">{error}</Alert>}
      {notice && <Alert color="orange">{t(notice)}</Alert>}
      {(phase === 'setup' || phase === 'locked') && (
        <Stack>
          {phase === 'setup' && (
            <>
              <TextInput
                label={t('devices.deviceName')}
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <TextInput
                label={t('devices.account')}
                placeholder="npub1…"
                value={account}
                onChange={(event) => setAccount(event.currentTarget.value)}
              />
              <Text size="sm">{t('devices.relayNotice')}</Text>
            </>
          )}
          <PasswordInput
            label={t('devices.password')}
            value={password}
            autoComplete={phase === 'setup' ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          {phase === 'setup' && (
            <PasswordInput
              label={t('devices.repeatPassword')}
              value={repeat}
              autoComplete="new-password"
              onChange={(event) => setRepeat(event.currentTarget.value)}
            />
          )}
          <Button
            loading={busy}
            disabled={
              password.length < 12 || (phase === 'setup' && (!name.trim() || !account.trim() || password !== repeat))
            }
            onClick={start}
          >
            {t(phase === 'setup' ? 'devices.createQR' : 'devices.unlock')}
          </Button>
        </Stack>
      )}
      {(phase === 'pairing' || phase === 'grant') && (
        <Stack align="center">
          <Text>{t('devices.showQR')}</Text>
          <Paper p="sm" bg="white" style={{ maxWidth: '100%' }}>
            <QRCodeSVG value={qr} size={280} style={{ maxWidth: '100%', height: 'auto' }} />
          </Paper>
          <Textarea readOnly label={t('devices.pairingText')} value={qr} autosize minRows={2} maxRows={4} w="100%" />
          <Code style={{ overflowWrap: 'anywhere' }}>{code}</Code>
          <Text size="sm">{t('devices.expiresHint')}</Text>
          {phase === 'grant' ? (
            <>
              <Checkbox
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
                label={t('devices.confirmCode')}
              />
              <Button
                loading={busy}
                disabled={!confirmed}
                onClick={() =>
                  perform(async () => {
                    const client = session.current!
                    await client.confirm(code)
                    if (session.current === client) {
                      setQR('')
                      enterApp()
                    }
                  })
                }
              >
                {t('devices.finish')}
              </Button>
            </>
          ) : (
            <Text>{t('devices.waiting')}</Text>
          )}
          <Button variant="light" onClick={lock}>
            {t('devices.lock')}
          </Button>
        </Stack>
      )}
      {phase === 'removed' && <Alert color="orange">{t('devices.removedExplanation')}</Alert>}
      {phase !== 'setup' && phase !== 'loading' && (
        <Stack mt="xl">
          <Checkbox
            checked={eraseConfirm}
            onChange={(event) => setEraseConfirm(event.currentTarget.checked)}
            label={t('devices.eraseConfirm')}
          />
          <Button
            variant="subtle"
            color="red"
            disabled={!eraseConfirm || busy}
            onClick={() =>
              perform(async () => {
                lock()
                const unlock = await exclusiveDeviceSession('companion')
                try {
                  await deleteLinkedVault()
                  setEraseConfirm(false)
                  setPhase('setup')
                } finally {
                  unlock()
                }
              })
            }
          >
            {t('devices.erase')}
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
