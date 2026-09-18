import { mkdir } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import {
  setupGreenApiMock,
  testChatId,
  testCredentials,
  testPhone,
  type GreenApiMock,
} from './fixtures/greenApiMock'

const MESSAGE_MAX_LENGTH = 4000
const screenshotsDir = 'docs/screenshots'

async function openConnectScreen(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Подключите инстанс' })).toBeVisible()
  await expect(page.getByLabel('idInstance')).toBeVisible()
  await expect(page.getByLabel('apiTokenInstance')).toBeVisible()
  await expect(page.getByLabel('apiUrl')).toHaveCount(0)
}

async function openAdvancedSettings(page: Page) {
  await page.getByRole('button', { name: 'Расширенные настройки' }).click()
  await expect(page.getByLabel('apiUrl')).toBeVisible()
}

async function connect(page: Page) {
  await page.getByLabel('idInstance').fill(testCredentials.idInstance)
  await page.getByLabel('apiTokenInstance').fill(testCredentials.apiTokenInstance)
  await openAdvancedSettings(page)
  await page.getByLabel('apiUrl').fill(testCredentials.apiUrl)
  await page.getByRole('button', { name: 'Подключить' }).click()
  await expect(page.getByRole('button', { name: 'Новый чат' })).toBeVisible()
}

async function createChat(page: Page, phone = '+7 999 123 45 67') {
  await page.getByRole('button', { name: 'Новый чат' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый чат' })
  await dialog.getByLabel('Номер телефона').fill(phone)
  await dialog.getByRole('button', { name: 'Создать чат' }).click()
  await expect(page.getByRole('heading', { name: testPhone })).toBeVisible()
}

async function connectAndCreateChat(page: Page, mock: GreenApiMock) {
  await openConnectScreen(page)
  await connect(page)
  await createChat(page)
  await expect.poll(() => mock.counters.checkAccount).toBe(1)
}

test('happy path connects, creates chat, sends, receives, and captures demo screenshots', async ({
  page,
}) => {
  const mock = await setupGreenApiMock(page)
  await mkdir(screenshotsDir, { recursive: true })

  await openConnectScreen(page)
  await page.screenshot({ path: `${screenshotsDir}/connect.png`, fullPage: true })

  await connect(page)
  await createChat(page)
  await expect(mock.checkAccountBodies).toEqual([{ phoneNumber: Number(testPhone) }])
  await page.screenshot({ path: `${screenshotsDir}/chat.png`, fullPage: true })

  await page.getByLabel('Сообщение').fill('Привет')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByTestId('message-outgoing-message-1')).toContainText('Привет')
  await expect(mock.sendMessageBodies).toEqual([{ chatId: testChatId, message: 'Привет' }])
  await page.screenshot({ path: `${screenshotsDir}/outgoing.png`, fullPage: true })

  mock.enqueueIncoming({ text: 'Ответ' })
  await expect(page.getByTestId('message-incoming-id')).toContainText('Ответ')
  await expect.poll(() => mock.counters.deleteNotification).toBe(1)
  await page.screenshot({ path: `${screenshotsDir}/incoming.png`, fullPage: true })
})

test('invalid credentials stay on connect screen and show the GREEN-API state error', async ({
  page,
}) => {
  await setupGreenApiMock(page, { stateInstance: 'notAuthorized' })

  await openConnectScreen(page)
  await connect(page).catch(() => undefined)

  await expect(page.getByRole('alert')).toHaveText(
    'Инстанс не авторизован. Авторизуйте аккаунт в GREEN-API.',
  )
  await expect(page.getByRole('heading', { name: 'Подключите инстанс' })).toBeVisible()
})

test('invalid phone is rejected before CheckAccount', async ({ page }) => {
  const mock = await setupGreenApiMock(page)
  await openConnectScreen(page)
  await connect(page)

  await page.getByRole('button', { name: 'Новый чат' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый чат' })
  await dialog.getByLabel('Номер телефона').fill('89991234567')
  await dialog.getByRole('button', { name: 'Создать чат' }).click()

  await expect(
    dialog.getByText('CheckAccount поддерживает только номера РФ (7) и РБ (375)'),
  ).toBeVisible()
  expect(mock.counters.checkAccount).toBe(0)
})

test('exist=false from CheckAccount keeps chat list empty', async ({ page }) => {
  await setupGreenApiMock(page, { accountExists: false })
  await openConnectScreen(page)
  await connect(page)

  await page.getByRole('button', { name: 'Новый чат' }).click()
  const dialog = page.getByRole('dialog', { name: 'Новый чат' })
  await dialog.getByLabel('Номер телефона').fill('+7 999 123 45 67')
  await dialog.getByRole('button', { name: 'Создать чат' }).click()

  await expect(dialog.getByText('Аккаунт MAX не найден')).toBeVisible()
  await expect(page.getByText('Чатов пока нет.')).toBeVisible()
})

test('send error keeps composer text and shows API error', async ({ page }) => {
  const mock = await setupGreenApiMock(page, { sendStatus: 500 })
  await connectAndCreateChat(page, mock)

  const messageInput = page.getByLabel('Сообщение')
  await messageInput.fill('Не терять текст')
  await page.getByRole('button', { name: 'Отправить' }).click()

  await expect(page.getByRole('alert')).toHaveText('Ошибка GREEN-API: 500')
  await expect(messageInput).toHaveValue('Не терять текст')
  expect(mock.counters.sendMessage).toBe(1)
})

test('empty send is disabled and the 4000 character boundary is enforced', async ({ page }) => {
  const mock = await setupGreenApiMock(page)
  await connectAndCreateChat(page, mock)

  const messageInput = page.getByLabel('Сообщение')
  const sendButton = page.getByRole('button', { name: 'Отправить' })
  await expect(sendButton).toBeDisabled()

  await messageInput.fill('   ')
  await expect(sendButton).toBeDisabled()
  expect(mock.counters.sendMessage).toBe(0)

  await messageInput.fill('x'.repeat(MESSAGE_MAX_LENGTH))
  await sendButton.click()
  await expect(page.getByTestId('message-outgoing-message-1')).toContainText(
    'x'.repeat(MESSAGE_MAX_LENGTH),
  )
  expect(mock.counters.sendMessage).toBe(1)

  await messageInput.fill('x'.repeat(MESSAGE_MAX_LENGTH + 1))
  await sendButton.click()
  await expect(page.getByRole('alert')).toHaveText('Сообщение длиннее 4000 символов')
  expect(mock.counters.sendMessage).toBe(1)
})

test('irrelevant and duplicate notifications are deleted without duplicate bubbles', async ({
  page,
}) => {
  const mock = await setupGreenApiMock(page)
  await connectAndCreateChat(page, mock)

  mock.enqueueIrrelevant()
  mock.enqueueIncoming({ idMessage: 'duplicate-id', text: 'Дубликат' })
  mock.enqueueIncoming({ idMessage: 'duplicate-id', text: 'Дубликат' })

  await expect(page.getByTestId('message-duplicate-id')).toContainText('Дубликат')
  await expect.poll(() => mock.counters.deleteNotification).toBe(3)
  await expect(page.getByText('Дубликат')).toHaveCount(1)
})

test('logout stops notification polling', async ({ page }) => {
  const mock = await setupGreenApiMock(page)
  await openConnectScreen(page)
  await connect(page)

  await expect.poll(() => mock.counters.receiveNotification).toBeGreaterThanOrEqual(1)
  await expect.poll(() => mock.pendingReceiveCount()).toBeGreaterThanOrEqual(1)

  await page.getByRole('button', { name: 'Отключить' }).click()
  await expect(page.getByRole('heading', { name: 'Подключите инстанс' })).toBeVisible()

  const receiveCallsAfterLogout = mock.counters.receiveNotification
  await expect(async () => {
    expect(mock.counters.receiveNotification).toBe(receiveCallsAfterLogout)
  }).toPass({ timeout: 1500 })
})

test('mobile viewport supports connect, chat creation, and incoming messages', async ({ page }) => {
  const mock = await setupGreenApiMock(page)
  await page.setViewportSize({ width: 390, height: 844 })

  await connectAndCreateChat(page, mock)
  mock.enqueueIncoming({ idMessage: 'mobile-incoming-id', text: 'Мобильный ответ' })

  await expect(page.getByTestId('message-mobile-incoming-id')).toContainText('Мобильный ответ')
  await expect(page.getByRole('button', { name: 'Назад' })).toBeVisible()
})
