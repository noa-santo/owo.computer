"use client";
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { Vector2, Vector3 } from 'three';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export default function FirstPersonControls() {
  const { camera, gl } = useThree();
  const [,getKeyboardState] = useKeyboardControls();

  const isDragging = useRef(false);
  const previousMouse = useRef(new Vector2());
  const sensitivity = 0.002;

  useEffect(() => {
    const initialPosition = new Vector3(0, 2.9, 4);
    const finalPosition = new Vector3(0, 3, 10);

    camera.position.set(initialPosition.x, initialPosition.y, initialPosition.z);
    camera.rotation.set(0, 0, 0);

    setTimeout(() => {
      gsap.to(camera.position, {
        x: finalPosition.x,
        y: finalPosition.y,
        z: finalPosition.z,
        duration: 1,
        ease: "power1.inOut"
      }).then();
    }, 1000);

    const handleMouseDown = (event: { clientX: number; clientY: number; }) => {
      isDragging.current = true;
      previousMouse.current.set(event.clientX, event.clientY);
    };

    const handleMouseMove = (event: { clientX: number; clientY: number; }) => {
      if (!isDragging.current) return;

      const deltaX = event.clientX - previousMouse.current.x;
      const deltaY = event.clientY - previousMouse.current.y;
      previousMouse.current.set(event.clientX, event.clientY);

      camera.rotation.y -= deltaX * sensitivity;
      camera.rotation.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, camera.rotation.x - deltaY * sensitivity)
      );
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const domElement = gl.domElement;
    domElement.addEventListener('mousedown', handleMouseDown);
    domElement.addEventListener('mousemove', handleMouseMove);
    domElement.addEventListener('mouseup', handleMouseUp);

    return () => {
      domElement.removeEventListener('mousedown', handleMouseDown);
      domElement.removeEventListener('mousemove', handleMouseMove);
      domElement.removeEventListener('mouseup', handleMouseUp);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const { forward, backward, left, right, up, down } = getKeyboardState();
    const speed = 5;

    const direction = new Vector3();
    const frontVector = new Vector3(0, 0, Number(backward) - Number(forward));
    const sideVector = new Vector3(Number(left) - Number(right), 0, 0);
    const verticalVector = new Vector3(0, Number(up) - Number(down), 0);

    direction
      .subVectors(frontVector, sideVector)
      .add(verticalVector)
      .normalize()
      .multiplyScalar(speed * delta)
      .applyEuler(camera.rotation);

    camera.position.add(direction);
  });

  return null;
}
