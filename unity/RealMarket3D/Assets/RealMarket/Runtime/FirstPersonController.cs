using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Birinci şahıs yürüyüş: CharacterController (raf/duvar çarpışması, kayarak ilerleme),
     * sınırlı ivme/yavaşlama, isteğe bağlı baş salınımı, masaüstünde işaretçi kilidi ile fare bakışı,
     * mobilde sanal joystick + sağ yarı ekranda sürükleyerek bakış. Hareket FixedUpdate'te sabit
     * adımda hesaplanır, kamera Update'te yumuşatılır.
     */
    [RequireComponent(typeof(CharacterController))]
    public class FirstPersonController : MonoBehaviour
    {
        public float WalkSpeed = 1.4f, RunSpeed = 2.4f, Accel = 6f, Decel = 9f;
        public float EyeHeight = 1.62f;
        public float MouseSensitivity = 0.11f, TouchSensitivity = 0.22f;
        public bool HeadBob = true;
        public bool InputEnabled = true;
        public float SpeedMultiplier = 1f;
        public Camera Cam { get; private set; }
        public Vector3 Velocity => new Vector3(vx, 0, vz);

        CharacterController cc;
        float yaw, pitch, vx, vz, vy, bobPhase;
        Vector3 camBase;

        public void Init(Vector3 position, float yawDeg)
        {
            cc = GetComponent<CharacterController>();
            cc.height = 1.75f;
            cc.radius = 0.28f;
            cc.center = new Vector3(0, cc.height / 2f, 0);
            cc.stepOffset = 0.25f;
            cc.slopeLimit = 40f;
            cc.enabled = false;
            transform.position = position;
            cc.enabled = true;
            yaw = yawDeg;
            if (Cam == null)
            {
                var camGo = new GameObject("PlayerCamera");
                camGo.tag = "MainCamera";
                camGo.transform.SetParent(transform, false);
                Cam = camGo.AddComponent<Camera>();
                Cam.nearClipPlane = 0.05f;
                Cam.farClipPlane = 120f;
                Cam.fieldOfView = 68f;
                camGo.AddComponent<AudioListener>();
            }
            camBase = new Vector3(0, EyeHeight, 0);
            Cam.transform.localPosition = camBase;
            ApplyRotation();
        }

        void ApplyRotation()
        {
            transform.rotation = Quaternion.Euler(0, yaw, 0);
            Cam.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
        }

        void Update()
        {
            if (Cam == null) return;
            if (InputEnabled)
            {
                Vector2 look = InputAdapter.LookDelta();
                float sens = Cursor.lockState == CursorLockMode.Locked ? MouseSensitivity : TouchSensitivity;
                yaw += look.x * sens;
                pitch = Mathf.Clamp(pitch - look.y * sens, -80f, 80f);
            }
            float speed = new Vector2(vx, vz).magnitude;
            if (speed > 0.05f) bobPhase += Time.deltaTime * MotionMath.StepRate(speed);
            MotionMath.HeadBob(bobPhase, speed, HeadBob, out float by, out float bx, out float roll);
            Cam.transform.localPosition = camBase + new Vector3(bx, by, 0);
            transform.rotation = Quaternion.Euler(0, yaw, 0);
            Cam.transform.localRotation = Quaternion.Euler(pitch, 0, roll);
        }

        void FixedUpdate()
        {
            if (cc == null || !cc.enabled) return;
            float dt = Time.fixedDeltaTime;
            Vector2 mv = InputEnabled ? InputAdapter.Move() : Vector2.zero;
            float target = (InputAdapter.Run() ? RunSpeed : WalkSpeed) * SpeedMultiplier;
            Vector3 fwd = Quaternion.Euler(0, yaw, 0) * Vector3.forward;
            Vector3 right = Quaternion.Euler(0, yaw, 0) * Vector3.right;
            Vector3 wish = (fwd * mv.y + right * mv.x) * target;
            MotionMath.ApproachVelocity(ref vx, ref vz, wish.x, wish.z, Accel, Decel, dt);
            vy = cc.isGrounded ? -1f : vy - 9.81f * dt;
            var flags = cc.Move(new Vector3(vx, vy, vz) * dt);
            if ((flags & CollisionFlags.Sides) != 0)
            {
                // duvara sürtünürken hız gerçek harekete indirgenir (sekme yok)
                vx *= 0.6f; vz *= 0.6f;
            }
        }

        public float Yaw => yaw;
        public float Pitch => pitch;

        /** Bakış yönünü doğrudan ayarlar (köprü test komutu DEBUG_LOOK). */
        public void SetLook(float yawDeg, float pitchDeg)
        {
            yaw = yawDeg;
            pitch = Mathf.Clamp(pitchDeg, -80f, 80f);
        }

        public void Teleport(Vector3 p, float yawDeg)
        {
            cc.enabled = false;
            transform.position = p;
            cc.enabled = true;
            yaw = yawDeg; pitch = 0; vx = vz = 0;
        }
    }
}
