import React, { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, PerspectiveCamera, useFBX, useGLTF } from "@react-three/drei";
import * as THREE from "three";
class AvatarModelBoundary extends React.Component {
    constructor() {
        super(...arguments);
        this.state = { failed: false };
    }
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
/**
 * 3D Procedural Avatar Head - Uses procedural generation for avatar when no GLB model available
 */
const ProceduralAvatarHead = ({ isListening, isSpeaking, audioAnalyser, mood = "ready", speechText = "", speechIntensity = 0, }) => {
    const meshRef = useRef(null);
    const headRef = useRef(null);
    const mouthRef = useRef(null);
    const eyeLeftRef = useRef(null);
    const eyeRightRef = useRef(null);
    const antennaLeftRef = useRef(null);
    const antennaRightRef = useRef(null);
    const earLeftRef = useRef(null);
    const earRightRef = useRef(null);
    const armLeftRef = useRef(null);
    const armRightRef = useRef(null);
    const chestRef = useRef(null);
    const frequencyData = useRef(new Uint8Array(256));
    const tone = useMemo(() => {
        if (mood === "thinking")
            return { core: "#7cc9ff", glow: "#308cff" };
        return { core: "#48d9ff", glow: "#009dff" };
    }, [isSpeaking, mood]);
    useFrame(({ clock }) => {
        if (!meshRef.current)
            return;
        const t = clock.getElapsedTime();
        const active = isSpeaking || mood === "speaking";
        meshRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
        meshRef.current.rotation.x = Math.sin(t * 0.28) * 0.035;
        meshRef.current.position.y = Math.sin(t * (isListening ? 2.7 : 1.25)) * (isListening ? 0.055 : 0.025);
        if (headRef.current) {
            headRef.current.rotation.z = Math.sin(t * (isListening ? 2.1 : 0.8)) * (isListening ? 0.045 : 0.018);
        }
        let lipAmount = 0;
        if (active && audioAnalyser) {
            audioAnalyser.getByteFrequencyData(frequencyData.current);
            const lowFreq = frequencyData.current.slice(0, 12).reduce((a, b) => a + b) / 12;
            lipAmount = Math.min(1, lowFreq / 180);
        }
        else if (active) {
            const syllableSeed = Math.max(8, speechText.replace(/\s+/g, "").length);
            lipAmount =
                speechIntensity ||
                    (0.28 + Math.abs(Math.sin(t * 9.5 + syllableSeed * 0.17)) * 0.55 + Math.abs(Math.sin(t * 16.3)) * 0.17);
        }
        if (mouthRef.current) {
            const targetY = active ? 0.42 + lipAmount * 1.3 : 0.18;
            mouthRef.current.scale.y = THREE.MathUtils.lerp(mouthRef.current.scale.y, targetY, 0.38);
            mouthRef.current.scale.x = THREE.MathUtils.lerp(mouthRef.current.scale.x, active ? 1 + lipAmount * 0.18 : 1, 0.25);
        }
        if (eyeLeftRef.current && eyeRightRef.current) {
            const blink = Math.sin(t * 2.2) > 0.985 ? 0.08 : 1;
            eyeLeftRef.current.scale.y = blink;
            eyeRightRef.current.scale.y = blink;
        }
        const hearingPulse = isListening ? 1 + Math.sin(t * 7) * 0.22 : 1 + Math.sin(t * 2.8) * 0.06;
        antennaLeftRef.current?.scale.setScalar(hearingPulse);
        antennaRightRef.current?.scale.setScalar(hearingPulse);
        earLeftRef.current?.scale.setScalar(isListening ? 1 + Math.sin(t * 6.5) * 0.12 : 1);
        earRightRef.current?.scale.setScalar(isListening ? 1 + Math.sin(t * 6.5 + 0.6) * 0.12 : 1);
        if (armLeftRef.current && armRightRef.current) {
            armLeftRef.current.rotation.z = 0.28 + Math.sin(t * (active ? 3.5 : 1.4)) * (active ? 0.08 : 0.035);
            armRightRef.current.rotation.z = -0.28 - Math.sin(t * (active ? 3.5 : 1.4)) * (active ? 0.08 : 0.035);
        }
        if (chestRef.current) {
            chestRef.current.scale.setScalar(1 + Math.sin(t * (active ? 7.5 : 4.6)) * (active ? 0.18 : 0.08));
        }
    });
    return (<group ref={meshRef} scale={[0.82, 0.82, 0.82]} position={[0, -0.15, 0]}>
      <group ref={headRef}>
        <mesh position={[0, 0.64, 0]} scale={[1.25, 0.86, 0.8]}>
          <capsuleGeometry args={[0.52, 0.52, 16, 56]}/>
          <meshPhysicalMaterial color="#f6f8fb" roughness={0.18} metalness={0.08} clearcoat={0.8} clearcoatRoughness={0.22}/>
        </mesh>

        <mesh position={[0, 0.55, 0.58]} scale={[1.18, 0.7, 0.09]}>
          <capsuleGeometry args={[0.28, 0.72, 16, 52]}/>
          <meshStandardMaterial color="#03070d" roughness={0.12} metalness={0.42}/>
        </mesh>

        <mesh position={[0.39, 0.82, 0.635]} rotation={[0, 0, -0.16]} scale={[0.42, 0.12, 0.05]}>
          <boxGeometry args={[0.36, 0.12, 0.05]}/>
          <meshStandardMaterial color="#ffffff" transparent opacity={0.26} roughness={0.08}/>
        </mesh>

        <mesh position={[-0.29, 0.67, 0.675]} ref={eyeLeftRef} scale={[0.82, 1.05, 0.16]}>
          <sphereGeometry args={[0.13, 34, 24]}/>
          <meshStandardMaterial color="#47dcff" emissive="#009dff" emissiveIntensity={2.15} roughness={0.12}/>
        </mesh>
        <mesh position={[0.29, 0.67, 0.675]} ref={eyeRightRef} scale={[0.82, 1.05, 0.16]}>
          <sphereGeometry args={[0.13, 34, 24]}/>
          <meshStandardMaterial color="#47dcff" emissive="#009dff" emissiveIntensity={2.15} roughness={0.12}/>
        </mesh>

        {[-0.28, 0.28].map((x) => [-0.04, 0, 0.04].map((y) => (<mesh key={`${x}-${y}`} position={[x, 0.67 + y, 0.698]} scale={[0.72, 0.035, 0.02]}>
              <boxGeometry args={[0.17, 0.012, 0.012]}/>
              <meshStandardMaterial color="#d9f8ff" emissive="#009dff" emissiveIntensity={0.82} roughness={0.2}/>
            </mesh>)))}

        <group ref={mouthRef} position={[0, 0.36, 0.695]} scale={[1, 0.18, 1]}>
          <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI]} scale={[1.15, 0.55, 0.08]}>
            <torusGeometry args={[0.14, 0.014, 8, 34, Math.PI]}/>
            <meshStandardMaterial color="#48d9ff" emissive="#009dff" emissiveIntensity={1.75} roughness={0.16}/>
          </mesh>
          {[-0.12, -0.04, 0.04, 0.12].map((x, index) => (<mesh key={x} position={[x, -0.015 + (index % 2) * 0.015, 0.01]} scale={[0.08, 0.72 + index * 0.08, 0.08]}>
              <boxGeometry args={[0.08, 0.12, 0.03]}/>
              <meshStandardMaterial color="#48d9ff" emissive="#009dff" emissiveIntensity={1.55} roughness={0.18}/>
            </mesh>))}
        </group>

        <mesh position={[-0.74, 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.16, 36]}/>
          <meshPhysicalMaterial color="#dce4ee" roughness={0.2} metalness={0.14} clearcoat={0.6}/>
        </mesh>
        <mesh ref={earLeftRef} position={[-0.79, 0.55, 0.02]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.06, 36]}/>
          <meshStandardMaterial color={tone.core} emissive={tone.glow} emissiveIntensity={0.95} roughness={0.2}/>
        </mesh>
        <mesh position={[0.74, 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.16, 36]}/>
          <meshPhysicalMaterial color="#dce4ee" roughness={0.2} metalness={0.14} clearcoat={0.6}/>
        </mesh>
        <mesh ref={earRightRef} position={[0.79, 0.55, 0.02]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.06, 36]}/>
          <meshStandardMaterial color={tone.core} emissive={tone.glow} emissiveIntensity={0.95} roughness={0.2}/>
        </mesh>

        <mesh position={[-0.62, 0.98, 0]} rotation={[0, 0, -0.12]}>
          <cylinderGeometry args={[0.012, 0.012, 0.42, 12]}/>
          <meshStandardMaterial color="#4f5c68" roughness={0.35} metalness={0.65}/>
        </mesh>
        <mesh ref={antennaLeftRef} position={[-0.65, 1.21, 0]}>
          <sphereGeometry args={[0.055, 20, 16]}/>
          <meshStandardMaterial color={tone.core} emissive={tone.glow} emissiveIntensity={1.15} roughness={0.18}/>
        </mesh>
        <mesh position={[0.62, 0.98, 0]} rotation={[0, 0, 0.12]}>
          <cylinderGeometry args={[0.012, 0.012, 0.42, 12]}/>
          <meshStandardMaterial color="#4f5c68" roughness={0.35} metalness={0.65}/>
        </mesh>
        <mesh ref={antennaRightRef} position={[0.65, 1.21, 0]}>
          <sphereGeometry args={[0.055, 20, 16]}/>
          <meshStandardMaterial color={tone.core} emissive={tone.glow} emissiveIntensity={1.15} roughness={0.18}/>
        </mesh>
      </group>

      <mesh position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.2, 36]}/>
        <meshStandardMaterial color="#15171a" roughness={0.34} metalness={0.72}/>
      </mesh>

      <mesh position={[0, -0.45, 0]} scale={[0.68, 0.82, 0.5]}>
        <capsuleGeometry args={[0.42, 0.34, 12, 36]}/>
        <meshPhysicalMaterial color="#f2f5f8" roughness={0.22} metalness={0.08} clearcoat={0.55}/>
      </mesh>
      <mesh position={[0, -0.62, 0.43]} scale={[0.52, 0.28, 0.08]}>
        <capsuleGeometry args={[0.17, 0.35, 10, 28]}/>
        <meshStandardMaterial color="#11151b" roughness={0.3} metalness={0.45}/>
      </mesh>
      <mesh ref={chestRef} position={[0.27, -0.34, 0.42]}>
        <torusGeometry args={[0.065, 0.014, 8, 36]}/>
        <meshStandardMaterial color={tone.core} emissive={tone.glow} emissiveIntensity={1.1} roughness={0.2}/>
      </mesh>

      <group ref={armLeftRef} position={[-0.52, -0.36, 0]}>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.14, 24, 18]}/>
          <meshStandardMaterial color="#dce4ed" roughness={0.24} metalness={0.22}/>
        </mesh>
        <mesh position={[-0.15, -0.34, 0]} rotation={[0, 0, -0.24]}>
          <capsuleGeometry args={[0.09, 0.38, 8, 18]}/>
          <meshStandardMaterial color="#f1f4f7" roughness={0.26} metalness={0.1}/>
        </mesh>
        <mesh position={[-0.24, -0.62, 0]} rotation={[0, 0, -0.18]}>
          <capsuleGeometry args={[0.11, 0.34, 8, 18]}/>
          <meshStandardMaterial color="#eff3f7" roughness={0.24} metalness={0.1}/>
        </mesh>
        <mesh position={[-0.25, -0.86, 0]} scale={[0.9, 0.55, 0.75]}>
          <sphereGeometry args={[0.11, 20, 14]}/>
          <meshStandardMaterial color="#e7edf3" roughness={0.24} metalness={0.12}/>
        </mesh>
      </group>

      <group ref={armRightRef} position={[0.52, -0.36, 0]}>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.14, 24, 18]}/>
          <meshStandardMaterial color="#dce4ed" roughness={0.24} metalness={0.22}/>
        </mesh>
        <mesh position={[0.15, -0.34, 0]} rotation={[0, 0, 0.24]}>
          <capsuleGeometry args={[0.09, 0.38, 8, 18]}/>
          <meshStandardMaterial color="#f1f4f7" roughness={0.26} metalness={0.1}/>
        </mesh>
        <mesh position={[0.24, -0.62, 0]} rotation={[0, 0, 0.18]}>
          <capsuleGeometry args={[0.11, 0.34, 8, 18]}/>
          <meshStandardMaterial color="#eff3f7" roughness={0.24} metalness={0.1}/>
        </mesh>
        <mesh position={[0.25, -0.86, 0]} scale={[0.9, 0.55, 0.75]}>
          <sphereGeometry args={[0.11, 20, 14]}/>
          <meshStandardMaterial color="#e7edf3" roughness={0.24} metalness={0.12}/>
        </mesh>
      </group>

      <mesh position={[-0.24, -1.15, 0]}>
        <capsuleGeometry args={[0.1, 0.46, 8, 18]}/>
        <meshStandardMaterial color="#dfe6ee" roughness={0.26} metalness={0.12}/>
      </mesh>
      <mesh position={[0.24, -1.15, 0]}>
        <capsuleGeometry args={[0.1, 0.46, 8, 18]}/>
        <meshStandardMaterial color="#dfe6ee" roughness={0.26} metalness={0.12}/>
      </mesh>
      <mesh position={[-0.24, -1.48, 0.08]} scale={[1.35, 0.48, 0.82]}>
        <sphereGeometry args={[0.16, 28, 18]}/>
        <meshStandardMaterial color="#f3f6f9" roughness={0.22} metalness={0.08}/>
      </mesh>
      <mesh position={[0.24, -1.48, 0.08]} scale={[1.35, 0.48, 0.82]}>
        <sphereGeometry args={[0.16, 28, 18]}/>
        <meshStandardMaterial color="#f3f6f9" roughness={0.22} metalness={0.08}/>
      </mesh>
    </group>);
};
/**
 * Avatar Loading from GLB Model
 */
const GLBAvatar = ({ isListening, isSpeaking, audioAnalyser, mood = "ready", speechText = "", speechIntensity = 0, modelUrl = "/avatar.glb", }) => {
    const groupRef = useRef(null);
    const frequencyData = useRef(new Uint8Array(256));
    const gltf = useGLTF(modelUrl || "/avatar.glb");
    useFrame(({ clock }) => {
        if (!groupRef.current)
            return;
        const t = clock.getElapsedTime();
        const active = isSpeaking || mood === "speaking";
        groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.15;
        groupRef.current.position.y = isListening ? Math.sin(t * 2.5) * 0.08 : Math.sin(t * 1.2) * 0.035;
        let lipInfluence = 0;
        if (active && audioAnalyser) {
            audioAnalyser.getByteFrequencyData(frequencyData.current);
            const mids = frequencyData.current.slice(8, 32).reduce((a, b) => a + b) / 24;
            lipInfluence = Math.min(1, mids / 200);
        }
        else if (active) {
            const syllableSeed = Math.max(8, speechText.replace(/\s+/g, "").length);
            lipInfluence =
                speechIntensity ||
                    Math.min(1, 0.28 + Math.abs(Math.sin(t * 9.5 + syllableSeed * 0.17)) * 0.54);
        }
        gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.morphTargetInfluences) {
                const targets = child.morphTargetDictionary || {};
                const mouthTargets = ["mouth_open", "mouthOpen", "mouth_A", "mouth_a", "A", "aa"];
                for (const target of mouthTargets) {
                    const index = targets[target];
                    if (index !== undefined) {
                        child.morphTargetInfluences[index] = THREE.MathUtils.lerp(child.morphTargetInfluences[index] || 0, lipInfluence, 0.38);
                    }
                }
                const blinkIndex = targets.blink ?? targets.eyeBlinkLeft ?? targets.Blink;
                if (blinkIndex !== undefined) {
                    child.morphTargetInfluences[blinkIndex] = Math.sin(t * 2.2) > 0.985 ? 1 : 0;
                }
            }
        });
    });
    return <primitive ref={groupRef} object={gltf.scene} scale={[2, 2, 2]}/>;
};
const FBXAvatar = ({ isListening, isSpeaking, audioAnalyser, mood = "ready", speechText = "", speechIntensity = 0, modelUrl = "/avatars/character_robot_ue5.FBX", }) => {
    const groupRef = useRef(null);
    const frequencyData = useRef(new Uint8Array(256));
    const fbx = useFBX(modelUrl || "/avatars/character_robot_ue5.FBX");
    useFrame(({ clock }) => {
        if (!groupRef.current)
            return;
        const t = clock.getElapsedTime();
        const active = isSpeaking || mood === "speaking";
        groupRef.current.rotation.y = Math.sin(t * 0.34) * 0.12;
        groupRef.current.position.y = isListening ? Math.sin(t * 2.4) * 0.05 : Math.sin(t * 1.2) * 0.025;
        let lipInfluence = 0;
        if (active && audioAnalyser) {
            audioAnalyser.getByteFrequencyData(frequencyData.current);
            const mids = frequencyData.current.slice(8, 32).reduce((a, b) => a + b) / 24;
            lipInfluence = Math.min(1, mids / 200);
        }
        else if (active) {
            const syllableSeed = Math.max(8, speechText.replace(/\s+/g, "").length);
            lipInfluence =
                speechIntensity ||
                    Math.min(1, 0.28 + Math.abs(Math.sin(t * 9.5 + syllableSeed * 0.17)) * 0.54);
        }
        fbx.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.morphTargetInfluences) {
                    const targets = child.morphTargetDictionary || {};
                    const mouthTargets = ["mouth_open", "mouthOpen", "mouth_A", "mouth_a", "A", "aa", "jawOpen"];
                    for (const target of mouthTargets) {
                        const index = targets[target];
                        if (index !== undefined) {
                            child.morphTargetInfluences[index] = THREE.MathUtils.lerp(child.morphTargetInfluences[index] || 0, lipInfluence, 0.38);
                        }
                    }
                }
            }
        });
    });
    return (<primitive ref={groupRef} object={fbx} position={[0, -1.45, 0]} rotation={[0, 0, 0]} scale={[0.018, 0.018, 0.018]}/>);
};
/**
 * Main Avatar Canvas Component
 */
const AvatarCanvas = ({ isListening = false, isSpeaking = false, message = "", mood = "ready", audioAnalyser, speechText = "", speechIntensity = 0, modelUrl = null, onReady, }) => {
    const normalizedModelUrl = modelUrl?.toLowerCase() || "";
    const isFbxModel = normalizedModelUrl.endsWith(".fbx");
    const fallback = (<ProceduralAvatarHead isListening={isListening} isSpeaking={isSpeaking} audioAnalyser={audioAnalyser} mood={mood} speechText={speechText || message} speechIntensity={speechIntensity}/>);
    return (<Canvas camera={{ position: [0, 0, 3], fov: 50 }} style={{
            width: "100%",
            height: "100%",
            background: "transparent",
        }} onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            onReady?.();
        }}>
      <ambientLight intensity={0.45}/>
      <directionalLight position={[2.8, 5, 4]} intensity={1.6} castShadow/>
      <pointLight position={[-2.6, 1.7, 2.8]} intensity={0.75} color="#8fd7ff"/>
      <pointLight position={[2.8, -0.2, 2.2]} intensity={0.35} color="#b7a6ff"/>

      <PerspectiveCamera makeDefault position={[0, 0, 3]} fov={50}/>

      {modelUrl ? (<AvatarModelBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            {isFbxModel ? (<FBXAvatar isListening={isListening} isSpeaking={isSpeaking} audioAnalyser={audioAnalyser} mood={mood} speechText={speechText || message} speechIntensity={speechIntensity} modelUrl={modelUrl}/>) : (<GLBAvatar isListening={isListening} isSpeaking={isSpeaking} audioAnalyser={audioAnalyser} mood={mood} speechText={speechText || message} speechIntensity={speechIntensity} modelUrl={modelUrl}/>)}
          </Suspense>
        </AvatarModelBoundary>) : (fallback)}

      <Environment preset="studio"/>
    </Canvas>);
};
export default AvatarCanvas;
