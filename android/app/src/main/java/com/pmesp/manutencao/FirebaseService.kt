package com.pmesp.manutencao

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Firebase Cloud Messaging Service
 * Recebe notificações push e mostra pro usuário
 */
class FirebaseService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "Push recebido de: ${remoteMessage.from}")

        val title = remoteMessage.notification?.title
            ?: remoteMessage.data["title"] ?: "Manutenção PMESP"
        val body = remoteMessage.notification?.body
            ?: remoteMessage.data["body"] ?: ""
        val url = remoteMessage.data["url"] // URL pra abrir quando tocar na notificação

        showNotification(title, body, url)
    }

    override fun onNewToken(token: String) {
        Log.d(TAG, "Novo FCM token: ${token.take(20)}...")
        // Envia o token pro Convex via WebView (próximo login)
        // Por enquanto só loga. A próxima vez que o MainActivity abrir, ele vai pegar o token.
    }

    private fun showNotification(title: String, body: String, url: String?) {
        val channelId = "pmesp_manutencao_default"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Android 8+ precisa de channel
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Manutenção PMESP",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificações de novos serviços e atualizações"
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Intent: abre o app (ou URL específica) ao tocar
        val intent = if (url != null) {
            Intent(this, MainActivity::class.java).apply {
                putExtra("url", url)
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
        } else {
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    companion object {
        private const val TAG = "FirebaseService"
    }
}
