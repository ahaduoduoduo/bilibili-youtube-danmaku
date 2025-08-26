import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
    // 配置持久化的Chrome用户数据目录, 可以保存登录状态、Cookie等数据，方便开发时无需重复登录B站
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data']

    // 注意：直接通过npm run dev:firefox登录的状态不会被保存，需要手动启动这个Profile并登录B站
    // 如需使用请取消下一行注释并填写对应的Profile名称，注意：Profile名称必须与Firefox中创建的Profile名称一致
    // firefoxProfile: 'wxt-dev-profile'
});
