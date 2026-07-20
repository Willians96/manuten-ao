# Manutenção PMESP — App Android

App nativo Android (Kotlin) que abre o sistema Manutenção PMESP em WebView.
Conecta direto no Vercel: `https://manutencao-drab.vercel.app`

## ✨ Recursos

- 🌐 WebView com JavaScript + cookies habilitados (Clerk auth funciona)
- 📱 Botão **voltar** navega no histórico (não fecha o app)
- 🔄 **Pull-to-refresh** recarrega a página
- 📊 Barra de progresso no topo enquanto carrega
- 🔗 Links internos (Vercel, Convex, Clerk) abrem dentro do app
- 🔗 Links externos abrem no navegador do sistema
- 🎨 Ícone PMESP (azul #003882 com chave amarela de manutenção)
- 🚀 Status bar azul PMESP

## 📋 Estrutura

```
android/
├── build.gradle              # Top-level Gradle config
├── settings.gradle
├── gradle.properties
├── app/
│   ├── build.gradle          # App config (compileSdk 34, minSdk 24)
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/pmesp/manutencao/
│       │   └── MainActivity.kt
│       └── res/
│           ├── drawable/      # Ícones
│           ├── mipmap-*/      # PNGs do launcher
│           ├── values/        # strings, styles, cores PMESP
│           └── xml/           # network_security_config
```

## 🛠️ Como buildar

### Opção 1: Android Studio (recomendado)

1. Abre o Android Studio
2. File → Open → seleciona a pasta `android/`
3. Espera o Gradle sync (baixa dependências automaticamente)
4. Build → Build Bundle(s) / APK(s) → Build APK(s)
5. APK sai em `app/build/outputs/apk/debug/app-debug.apk`

### Opção 2: Linha de comando (com Gradle + Android SDK)

```bash
cd android
./gradlew assembleDebug          # debug
./gradlew assembleRelease        # release (precisa signing config)
```

## 📱 Instalar no celular

### Via cabo USB (com ADB)

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Via APK direto

1. Copia o `.apk` pro celular
2. Abre o arquivo no gerenciador de arquivos
3. Permite instalar de fontes desconhecidas
4. Confirma instalação

## 🔧 Configuração

- **URL**: `https://manutencao-drab.vercel.app` (hardcoded em `MainActivity.kt`)
- **Package**: `com.pmesp.manutencao`
- **Versão**: 1.0 (versionCode 1)
- **Min SDK**: 24 (Android 7.0)
- **Target SDK**: 34 (Android 14)

## 🎨 Cores PMESP

- Azul principal: `#003882`
- Amarelo: `#f6d700`
- Vermelho: `#e30613`
- Azul escuro: `#001f47`

## 📝 Próximos passos

- [ ] Gerar keystore para release assinado
- [ ] Publicar na Google Play Store (opcional)
- [ ] Adicionar splash screen com escudo PMESP
- [ ] Push notifications pra novos serviços
