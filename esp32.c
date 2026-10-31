#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>

const char* ssid = "Getting High";
const char* password = "lookbehind";

// Replace with your laptop's actual IPv4 address
const char* serverURL =
  "http://192.168.31.69:5000/api/rfid";

#define SS_PIN 5
#define RST_PIN 22

MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(1000);

  SPI.begin(18, 19, 23, SS_PIN);
  rfid.PCD_Init();

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting to Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi connected!");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
  Serial.println("Ready to scan RFID cards.");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }

  uid.toUpperCase();

  Serial.println("Card UID: " + uid);

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.setTimeout(5000);
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");

    String payload =
      "{\"uid\":\"" + uid + "\",\"device_id\":\"ESP32_01\"}";

    int response = http.POST(payload);

    Serial.print("HTTP response: ");
    Serial.println(response);

    if (response > 0) {
      Serial.println(http.getString());
    } else {
      Serial.println(http.errorToString(response));
    }

    http.end();
  } else {
    Serial.println("Wi-Fi disconnected.");
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1500);
}