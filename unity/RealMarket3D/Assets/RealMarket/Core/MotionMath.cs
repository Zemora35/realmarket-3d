using System;

namespace RealMarket.Core
{
    /** Kamera ve araba hareketi için kare hızından bağımsız saf matematik (sabit adımda çağrılır). */
    public static class MotionMath
    {
        /** Hızı hedefe sınırlı ivmeyle yaklaştırır; durmak kalkmaktan hızlıdır. */
        public static void ApproachVelocity(ref float vx, ref float vz, float tx, float tz, float accel, float decel, float dt)
        {
            float dx = tx - vx, dz = tz - vz;
            float dist = (float)Math.Sqrt(dx * dx + dz * dz);
            if (dist < 1e-6f) { vx = tx; vz = tz; return; }
            bool speeding = Math.Sqrt(tx * tx + tz * tz) >= Math.Sqrt(vx * vx + vz * vz) - 1e-6;
            float step = (speeding ? accel : decel) * dt;
            if (dist <= step) { vx = tx; vz = tz; return; }
            vx += dx / dist * step;
            vz += dz / dist * step;
        }

        public static float Damp(float current, float target, float lambda, float dt) =>
            target + (current - target) * (float)Math.Exp(-lambda * dt);

        /** Yürüyüş salınımı (kapatılabilir): küçük dikey/yanal sapma ve yuvarlanma. */
        public static void HeadBob(float phase, float speed, bool enabled, out float y, out float x, out float roll)
        {
            if (!enabled) { y = x = roll = 0; return; }
            float s = Math.Min(1f, speed / 1.4f);
            y = (float)Math.Sin(phase * 2) * 0.011f * s;
            x = (float)Math.Sin(phase) * 0.006f * s;
            roll = (float)Math.Sin(phase) * 0.2f * s; // derece
        }

        public static float StepRate(float speed) => Math.Min(9f, 4.2f + speed * 2.2f);
    }

    /** Araba dinamiği: serbest kalınca sürtünmeyle durma, döner ön tekerlek hizalaması. */
    public static class CartDynamics
    {
        public const float RollingFriction = 1.1f, SleepSpeed = 0.02f, WheelRadius = 0.062f, CasterRate = 9f, FrontArm = 0.36f;

        public static void Coast(ref float vx, ref float vz, float dt)
        {
            float speed = (float)Math.Sqrt(vx * vx + vz * vz);
            if (speed < SleepSpeed) { vx = vz = 0; return; }
            float k = Math.Max(0f, speed - RollingFriction * dt) / speed;
            vx *= k;
            vz *= k;
        }

        /**
         * Unity'de araba ileri yönü yerel +z. casterAngle radyan (yerel y ekseni), wheelSpin radyan.
         * yawRate rad/s (pozitif = saat yönünde, yukarıdan bakınca).
         */
        public static void UpdateWheels(float vx, float vz, float yawRad, float yawRate, float dt, ref float casterAngle, ref float wheelSpin)
        {
            float speed = (float)Math.Sqrt(vx * vx + vz * vz);
            float c = (float)Math.Cos(yawRad), s = (float)Math.Sin(yawRad);
            // dünya → araba-yerel (Unity: yerel x sağ, z ileri)
            float lx = vx * c - vz * s;
            float lz = vx * s + vz * c;
            float vxAtCaster = lx + yawRate * FrontArm;
            if (speed > 0.05f || Math.Abs(yawRate) > 0.2f)
            {
                float target = (float)Math.Atan2(vxAtCaster, lz);
                float diff = target - casterAngle;
                while (diff > Math.PI) diff -= (float)(Math.PI * 2);
                while (diff < -Math.PI) diff += (float)(Math.PI * 2);
                casterAngle += diff * Math.Min(1f, CasterRate * dt * Math.Min(1f, speed * 2f + 0.2f));
            }
            float sign = lz >= 0 ? 1f : -1f;
            wheelSpin += sign * speed * dt / WheelRadius;
        }
    }

    /** Raf LOD seçimi (mesafe + ekran boyutu + histerezis). Unity: 1 yakın, 3 uzak; 0 inceleme. */
    public static class LodSelector
    {
        public static int Select(float distance, float sizeM, int prev, float mid, float far, float hysteresis)
        {
            float k = (float)Math.Sqrt(Math.Max(0.03f, sizeM) / 0.15f);
            float m = mid * k, f = far * k, h = hysteresis;
            int next = distance < m ? 1 : distance < f ? 2 : 3;
            if (next < prev)
            {
                if (prev == 3 && distance > f * (1 - h)) next = 3;
                else if (prev == 2 && next == 1 && distance > m * (1 - h)) next = 2;
                else if (prev == 3 && next == 1 && distance > m * (1 - h)) next = 2;
            }
            else if (next > prev)
            {
                if (prev == 1 && distance < m * (1 + h)) next = 1;
                else if (prev == 2 && distance < f * (1 + h)) next = 2;
            }
            return next;
        }
    }
}
